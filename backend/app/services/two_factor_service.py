"""Admin two-factor sign in: password, then a 6-digit code sent to the one corporate mailbox (ADMIN_2FA_EMAIL),
or, when TG_BOT_TOKEN and TG_OWNER_CHAT_ID are set (demo), to the owner's Telegram chat.

Rules:
- the code lives TWO_FACTOR_CODE_SECONDS; a whole sign in lives TWO_FACTOR_WINDOW_SECONDS;
- after TWO_FACTOR_MAX_ATTEMPTS wrong codes a new code is sent automatically (the old one stops working);
- "Send again" works once per TWO_FACTOR_RESEND_SECONDS;
- signing in again (same account, same website/phone) within TWO_FACTOR_RESEND_SECONDS of the last code sends
  no new code: the same sign in continues with a new token, so going back and retrying cannot burn the limit;
- parallel requests for one account wait for each other (row locks), so a double click sends one code;
- on top of that, at most TWO_FACTOR_MAX_CODES codes per account per window (rate_limit), then 429;
- a code works once and only for its own sign in; a new sign in cancels the previous unfinished one.
"""

import hashlib
import logging
import math
import secrets
import smtplib
from datetime import datetime, timedelta

import httpx
from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.config import settings
from app.core.security import hash_password, verify_password
from app.models import AuditAction, Role, StaffDevice, TwoFactorChallenge, User, UserStatus
from app.models.common import utcnow
from app.services import audit_service, email_service, telegram_service

log = logging.getLogger("keyfive")

WEB = "WEB"
DEVICE = "DEVICE"

EMAIL = "email"
TELEGRAM = "telegram"

_SIGN_IN_AGAIN = "This sign in is no longer valid. Sign in again with your password."


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def mask_email(email: str) -> str:
    """c***@corp.kz: enough to recognise the mailbox, not enough to learn it."""
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}"


def channel() -> str:
    """Telegram when both TG_* variables are set, else the corporate mailbox. 503 if neither can work."""
    if telegram_service.is_half_configured():
        log.error("Only one of TG_BOT_TOKEN / TG_OWNER_CHAT_ID is set: no Admin can sign in")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Admin sign in is not configured (Telegram is half set up). Contact the system owner.")
    if telegram_service.is_configured():
        return TELEGRAM
    corporate_email()
    return EMAIL


def sent_to() -> tuple[str, str]:
    """(channel, what the screen shows): ("email", "c***@corp.kz") or ("telegram", "Telegram")."""
    via = channel()
    return via, ("Telegram" if via == TELEGRAM else mask_email(corporate_email()))


def corporate_email() -> str:
    if not settings.ADMIN_2FA_EMAIL:
        log.error("ADMIN_2FA_EMAIL is not set: no Admin can sign in")
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE,
                            "Admin sign in is not configured (no corporate 2FA email). Contact the system owner.")
    return settings.ADMIN_2FA_EMAIL.strip()


def _send_code(db: Session, challenge: TwoFactorChallenge, ip: str | None) -> None:
    """New code for this challenge: checked against the per-account limit, mailed, counted, logged."""
    user = challenge.user
    rate_limit.check_two_factor_code(user.email)
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge.code_hash = hash_password(code)
    challenge.code_sent_at = utcnow()
    challenge.attempts = 0
    where = "the website" if challenge.channel == WEB else f"the phone \"{challenge.device.device_name}\""
    minutes = settings.TWO_FACTOR_CODE_SECONDS // 60
    subject = f"KeyFive WMS admin sign in: code {code}"
    text = (f"Admin sign in code: {code}\n\n"
            f"Account: {user.email}\nWhere: {where}\nIP: {ip or 'unknown'}\n"
            f"The code is valid for {minutes} minutes and works once.\n\n"
            "If nobody from the management is signing in right now, someone knows the Admin password: "
            "change it and check the audit log.")
    try:
        if channel() == TELEGRAM:
            telegram_service.send_to_owner(f"{subject}\n\n{text}")
        else:
            email_service.send_email(corporate_email(), subject, text)
    except (telegram_service.TelegramError, httpx.HTTPError, smtplib.SMTPException, OSError) as exc:
        log.error("Could not send the admin 2FA code: %s", exc)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not send the code email, try again later") from None
    rate_limit.two_factor_code_sent(user.email)
    audit_service.log(db, AuditAction.TWO_FACTOR_CODE_SENT, user, user, ip, channel=challenge.channel)


def needs_challenge(user: User, device: StaffDevice | None) -> bool:
    """Admin on the website: always. Admin in the app: until the code was entered once on that phone."""
    if user.role != Role.ADMIN:
        return False
    return device is None or device.two_factor_at is None


def start(db: Session, user: User, ip: str | None, device: StaffDevice | None = None) -> tuple[str, TwoFactorChallenge]:
    """Password was right: open a challenge and mail the code. Returns (challenge token for the client, row).
    The caller commits."""
    channel()  # fail before anything is created if 2FA cannot work
    # Parallel sign ins of one account run one after another (a double click must not send two codes).
    db.execute(select(User.id).where(User.id == user.id).with_for_update())
    now = utcnow()
    token = secrets.token_urlsafe(32)
    recent = _recent_challenge(db, user, device, now)
    if recent is not None:
        # Same sign in again right after a code was sent: keep that code, only the token is new
        # (the old tab/screen stops working, as with any new sign in). Wrong attempts are kept too.
        recent.token_hash = _hash_token(token)
        return token, recent
    # A new sign in cancels the unfinished ones: their codes stop working.
    _cancel_unfinished(db, user, now)
    challenge = TwoFactorChallenge(
        token_hash=_hash_token(token),
        user=user,
        channel=WEB if device is None else DEVICE,
        device=device,
        ip=ip,
        code_hash="",
        code_sent_at=now,
        expires_at=now + timedelta(seconds=settings.TWO_FACTOR_WINDOW_SECONDS),
    )
    db.add(challenge)
    db.flush()
    _send_code(db, challenge, ip)
    return token, challenge


def _recent_challenge(db: Session, user: User, device: StaffDevice | None, now: datetime) -> TwoFactorChallenge | None:
    """The unfinished sign in of this account on the same website/phone (device None = website) whose code went
    out less than TWO_FACTOR_RESEND_SECONDS ago, or None. Runs under the user lock taken in start()."""
    return db.scalars(
        select(TwoFactorChallenge)
        .where(TwoFactorChallenge.user_id == user.id,
               TwoFactorChallenge.used_at.is_(None),
               TwoFactorChallenge.device_id == device.id if device else TwoFactorChallenge.device_id.is_(None),
               TwoFactorChallenge.code_sent_at > now - timedelta(seconds=settings.TWO_FACTOR_RESEND_SECONDS))
        .order_by(TwoFactorChallenge.code_sent_at.desc())
        .limit(1)
    ).one_or_none()


def _cancel_unfinished(db: Session, user: User, now: datetime) -> None:
    db.execute(update(TwoFactorChallenge)
               .where(TwoFactorChallenge.user_id == user.id, TwoFactorChallenge.used_at.is_(None))
               .values(used_at=now))


def seconds_left(challenge: TwoFactorChallenge) -> tuple[int, int]:
    """(how long the current code still works, how soon "Send again" works), counted from code_sent_at."""
    passed = (utcnow() - challenge.code_sent_at).total_seconds()
    return (max(0, math.ceil(settings.TWO_FACTOR_CODE_SECONDS - passed)),
            max(0, math.ceil(settings.TWO_FACTOR_RESEND_SECONDS - passed)))


def _open_challenge(db: Session, token: str) -> TwoFactorChallenge:
    # Locked until commit: parallel "Send again" / code checks of one sign in wait for each other.
    challenge = db.scalars(
        select(TwoFactorChallenge).where(TwoFactorChallenge.token_hash == _hash_token(token)).with_for_update()
    ).one_or_none()
    if challenge is None or challenge.used_at is not None or challenge.expires_at <= utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _SIGN_IN_AGAIN)
    user = challenge.user
    # The account may have been blocked or demoted, or the phone blocked, while the code was on its way.
    if user.status != UserStatus.ACTIVE or user.role != Role.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    if challenge.device is not None and challenge.device.status != "APPROVED":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This phone is blocked for your account")
    return challenge


def code_expired(challenge: TwoFactorChallenge, now: datetime) -> bool:
    return (now - challenge.code_sent_at).total_seconds() > settings.TWO_FACTOR_CODE_SECONDS


def verify(db: Session, token: str, code: str, ip: str | None) -> TwoFactorChallenge:
    """Right code: the challenge is used up and returned (caller issues tokens and commits).
    Wrong code: the attempt is saved (committed here) and an error is raised."""
    challenge = _open_challenge(db, token)
    user = challenge.user
    now = utcnow()
    if not challenge.code_hash:  # burnt after too many wrong codes, and no new one could be sent
        raise HTTPException(status.HTTP_400_BAD_REQUEST, 'No valid code. Press "Send again" for a new one.')
    if code_expired(challenge, now):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The code has expired. Press \"Send again\" for a new one.")
    if not verify_password(code, challenge.code_hash):
        challenge.attempts += 1
        audit_service.log(db, AuditAction.TWO_FACTOR_FAILED, user, user, ip,
                          channel=challenge.channel, attempt=challenge.attempts)
        if challenge.attempts < settings.TWO_FACTOR_MAX_ATTEMPTS:
            db.commit()
            left = settings.TWO_FACTOR_MAX_ATTEMPTS - challenge.attempts
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Wrong code. Attempts left: {left}")
        # Too many wrong codes: this code is burnt, a new one goes out (if the account is still under the limit).
        challenge.code_hash = ""
        db.commit()
        _send_code(db, challenge, ip)
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Too many wrong codes. That code no longer works, a new code was sent.")
    challenge.used_at = now
    rate_limit.two_factor_passed(user.email)
    if challenge.device is not None:
        challenge.device.two_factor_at = now
    audit_service.log(db, AuditAction.TWO_FACTOR_PASSED, user, user, ip, channel=challenge.channel)
    return challenge


def resend(db: Session, token: str, ip: str | None) -> TwoFactorChallenge:
    challenge = _open_challenge(db, token)
    wait = settings.TWO_FACTOR_RESEND_SECONDS - (utcnow() - challenge.code_sent_at).total_seconds()
    if wait > 0:
        seconds = int(wait) + 1
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"Wait {seconds} s before requesting a new code",
                            headers={"Retry-After": str(seconds)})
    _send_code(db, challenge, ip)
    return challenge
