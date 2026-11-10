"""Sign-up email confirmation: a 6-digit code proves that the address exists and belongs to the user."""

import logging
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


def ensure_domain_accepts_mail(email: str) -> None:
    """Rejects addresses whose domain has no mail server, e.g. user@sfas.com.

    Whether the mailbox itself exists can only be proven by the code.
    """
    if not has_mail_server(email.rsplit("@", 1)[1]):
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
