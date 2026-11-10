"""Sign-up email confirmation: a 6-digit code proves that the address exists and belongs to the user."""

import logging
import re
import secrets
import smtplib
from datetime import timedelta
from email.message import EmailMessage
from email.utils import parseaddr

import dns.exception
import dns.resolver
import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import EmailVerification
from app.models.common import utcnow

log = logging.getLogger("keyfive")


def send_email(to: str, subject: str, text: str) -> None:
    """Brevo HTTP API (works on hosts that block SMTP ports, e.g. Render free) -> SMTP -> server log."""
    if settings.BREVO_API_KEY:
        name, address = parseaddr(settings.EMAIL_FROM)
        r = httpx.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": settings.BREVO_API_KEY},
            json={"sender": {"name": name or "KeyFive WMS", "email": address}, "to": [{"email": to}],
                  "subject": subject, "textContent": text},
            timeout=15,
        )
        r.raise_for_status()
    elif settings.SMTP_HOST:
        msg = EmailMessage()
        msg["From"], msg["To"], msg["Subject"] = settings.EMAIL_FROM, to, subject
        msg.set_content(text)
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            smtp.starttls()
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD or "")
            smtp.send_message(msg)
    else:
        log.warning("Email delivery is not configured. Email to %s: %s\n%s", to, subject, text)


# Public DNS (Google, Cloudflare): local networks may hide MX records, e.g. the KBTU network does for kbtu.kz.
_resolver = dns.resolver.Resolver(configure=False)
_resolver.nameservers = ["8.8.8.8", "1.1.1.1"]


def has_mail_server(domain: str) -> bool:
    """True if the domain has an MX record. Unknown (DNS timeout) counts as True so a slow DNS never blocks sign up."""
    try:
        answer = _resolver.resolve(domain, "MX", lifetime=5)
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers):
        return False
    except dns.exception.DNSException:
        return True
    return any(str(r.exchange) != "." for r in answer)  # "." = null MX: the domain says it takes no mail


# Popular mail domains, most used first. An address one or two typos away from one of them is almost always a mistake.
KNOWN_DOMAINS = [
    "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "icloud.com",
    "me.com", "aol.com", "gmx.com", "mail.com", "proton.me", "protonmail.com", "zoho.com",
    "mail.ru", "inbox.ru", "list.ru", "bk.ru", "internet.ru", "yandex.ru", "yandex.kz", "ya.ru", "rambler.ru",
    "mail.kz", "inbox.kz", "kbtu.kz", "wms.kz",
]


def _typo_distance(a: str, b: str) -> int:
    """Number of single-letter edits (insert, delete, replace, swap two neighbours) from a to b."""
    prev2, prev = [], list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] != b[j - 1]))
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], prev2[j - 2] + 1)
        prev2, prev = prev, cur
    return prev[-1]


def suggest_domain(domain: str) -> str | None:
    """gmial.com -> gmail.com. None if the domain is known or not close to any known one."""
    if domain in KNOWN_DOMAINS:
        return None
    if domain.split(".")[0] == "gmail":  # gmail.ru, gmail.kz: Gmail only exists as gmail.com
        return "gmail.com"
    best = min(KNOWN_DOMAINS, key=lambda known: _typo_distance(domain, known))
    limit = 2 if len(best) >= 9 else 1  # short domains (bk.ru, me.com) are too close to each other for 2
    return best if _typo_distance(domain, best) <= limit else None


# Gmail's own rule for usernames: 6-30 letters, digits and single dots ("+anything" after it is an alias).
_GMAIL_NAME = re.compile(r"^(?=.{6,30}$)[a-z0-9]+(\.[a-z0-9]+)*$")


def ensure_domain_accepts_mail(email: str) -> None:
    """Rejects typos of popular domains (user@gmial.com), impossible Gmail names (ab@gmail.com)
    and domains without a mail server (user@sfas.com).

    Whether the mailbox itself exists can only be proven by the code.
    """
    local, domain = email.rsplit("@", 1)
    if suggestion := suggest_domain(domain):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Check the email: did you mean {local}@{suggestion}?")
    if domain == "gmail.com" and not _GMAIL_NAME.match(local.split("+")[0]):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Not a possible Gmail address: the name has 6-30 Latin letters, digits and dots",
        )
    if not has_mail_server(domain):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This email domain does not accept mail, check the address")


def send_code(db: Session, email: str) -> None:
    """Creates (or replaces) the code for this email and sends it. The caller commits."""
    ensure_domain_accepts_mail(email)
    now = utcnow()
    row = db.get(EmailVerification, email)
    if row and (wait := settings.EMAIL_CODE_RESEND_SECONDS - (now - row.sent_at).total_seconds()) > 0:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Wait {int(wait) + 1} s before requesting a new code")

    code = f"{secrets.randbelow(1_000_000):06d}"
    if row is None:
        row = EmailVerification(email=email)
        db.add(row)
    row.code_hash = hash_password(code)
    row.attempts = 0
    row.sent_at = now
    row.expires_at = now + timedelta(minutes=settings.EMAIL_CODE_MINUTES)
    db.flush()

    try:
        send_email(
            email,
            f"KeyFive WMS: your code {code}",
            f"Your KeyFive WMS sign-up code: {code}\n\n"
            f"It is valid for {settings.EMAIL_CODE_MINUTES} minutes. "
            "If you did not sign up, just ignore this email.",
        )
    except (httpx.HTTPError, smtplib.SMTPException, OSError) as exc:
        log.error("Could not send code to %s: %s", email, exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not send the email, check the address") from None


def check_code(db: Session, email: str, code: str) -> None:
    """Raises 400 if the code is wrong or expired. Wrong attempts are saved even though the request fails."""
    row = db.get(EmailVerification, email)
    if row is None or row.expires_at < utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The code has expired, request a new one")
    if row.attempts >= settings.EMAIL_CODE_MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Too many wrong codes, request a new one")
    if not verify_password(code, row.code_hash):
        row.attempts += 1
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Wrong confirmation code")
    db.delete(row)
