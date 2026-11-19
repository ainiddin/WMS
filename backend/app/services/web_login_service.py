"""Website sign in for Admins and Managers, approved on their phone (like Steam Guard).

1. Browser: password -> a request with a two-digit number; the browser shows the number.
2. Phone (KeyFive Staff, approved phone): "Is this you?" with three numbers; the person taps the one the
   browser shows. A wrong pick or "No" rejects the request.
3. Browser: asks the status every few seconds while it waits; once approved it gets a website session
   (ADMIN_WEB_SESSION_HOURS, hard end), exactly once.

Admins keep the email code as a fallback (no phone at hand). Workers have nothing on the website.
"""

import hashlib
import secrets
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core import rate_limit
from app.core.config import settings
from app.models import AuditAction, DeviceStatus, Role, StaffDevice, User, UserStatus, WebLoginRequest
from app.models.common import utcnow
from app.services import audit_service

PENDING, APPROVED, DENIED, USED, CLOSED = "PENDING", "APPROVED", "DENIED", "USED", "CLOSED"
WEB_ROLES = (Role.ADMIN, Role.MANAGER)
_GONE = "This sign in is no longer valid. Sign in again with your password."


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _choices(number: int) -> list[int]:
    """The right number and two others, in random order."""
    others: set[int] = set()
    while len(others) < 2:
        n = 10 + secrets.randbelow(90)
        if n != number:
            others.add(n)
    out = [number, *others]
    for i in range(len(out) - 1, 0, -1):  # Fisher-Yates with a secure random
        j = secrets.randbelow(i + 1)
        out[i], out[j] = out[j], out[i]
    return out


def approving_phones(db: Session, user: User) -> list[StaffDevice]:
    """Phones that may approve: approved, and for an Admin also past the email code once."""
    stmt = select(StaffDevice).where(StaffDevice.user_id == user.id, StaffDevice.status == DeviceStatus.APPROVED)
    phones = list(db.scalars(stmt))
    if user.role == Role.ADMIN:
        phones = [p for p in phones if p.two_factor_at is not None]
    return phones


def start(db: Session, user: User, ip: str | None, user_agent: str | None) -> tuple[str, WebLoginRequest, bool]:
    """Password was right. Returns (token for the browser, request, whether a phone can approve it).
    The caller commits."""
    if user.role not in WEB_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workers use only the KeyFive Staff app")
    has_phone = bool(approving_phones(db, user))
    skip_phone = user.role == Role.MANAGER and not settings.MANAGER_WEB_PHONE_CONFIRM
    if not has_phone and user.role == Role.MANAGER and not skip_phone:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Sign in in the KeyFive Staff app on your work phone first: website sign ins are "
                            "approved there.")
    rate_limit.check_web_login(user.email)
    now = utcnow()
    db.execute(update(WebLoginRequest)  # a new sign in cancels the unfinished ones
               .where(WebLoginRequest.user_id == user.id, WebLoginRequest.status == PENDING)
               .values(status=CLOSED, decided_at=now))
    number = 10 + secrets.randbelow(90)
    token = secrets.token_urlsafe(32)
    request = WebLoginRequest(
        token_hash=_hash(token), user=user, number=number, choices=",".join(map(str, _choices(number))),
        status=PENDING, ip=ip, user_agent=(user_agent or "")[:200] or None,
        expires_at=now + timedelta(seconds=settings.WEB_LOGIN_SECONDS),
    )
    if skip_phone:  # demo switch: no phone step, the request is approved at once (and logged as such)
        request.status = APPROVED
        request.decided_at = now
    db.add(request)
    db.flush()
    rate_limit.web_login_requested(user.email)
    audit_service.log(db, AuditAction.WEB_LOGIN_REQUESTED, user, user, ip, request_id=request.id,
                      phone=has_phone)
    if skip_phone:
        audit_service.log(db, AuditAction.WEB_LOGIN_APPROVED, user, user, ip, request_id=request.id,
                          phone_confirmation="off")
    return token, request, has_phone


def by_token(db: Session, token: str) -> WebLoginRequest:
    request = db.scalars(select(WebLoginRequest).where(WebLoginRequest.token_hash == _hash(token))).one_or_none()
    if request is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _GONE)
    return request


def current_status(request: WebLoginRequest) -> str:
    if request.status == PENDING and request.expires_at <= utcnow():
        return "EXPIRED"
    return request.status


def collect(db: Session, request: WebLoginRequest) -> User | None:
    """Browser polling. APPROVED -> the user (the caller issues a session, once). PENDING -> None.
    Anything else -> 400/403. The caller commits."""
    state = current_status(request)
    if state == PENDING:
        return None
    if state == DENIED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The sign in was rejected on the phone")
    if state != APPROVED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _GONE)
    user = request.user
    if user.status != UserStatus.ACTIVE or user.role not in WEB_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    request.status = USED  # a session is handed out only once
    return user


def pending_for(db: Session, user: User) -> list[WebLoginRequest]:
    stmt = (select(WebLoginRequest)
            .where(WebLoginRequest.user_id == user.id, WebLoginRequest.status == PENDING,
                   WebLoginRequest.expires_at > utcnow())
            .order_by(WebLoginRequest.created_at.desc()))
    return list(db.scalars(stmt))


def decide(db: Session, request_id: int, user: User, device_id: int | None, number: int | None,
           ip: str | None) -> WebLoginRequest:
    """On the phone: `number` = the one tapped, None = "No, it was not me". The caller commits."""
    request = db.get(WebLoginRequest, request_id)
    if request is None or request.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sign-in request not found")
    device = db.get(StaffDevice, device_id) if device_id is not None else None
    if device is None or device not in approving_phones(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Approve website sign ins on your approved work phone")
    if current_status(request) != PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "This sign-in request is no longer waiting")
    request.decided_at = utcnow()
    request.decided_device = device
    if number is None:
        request.status = DENIED
        audit_service.log(db, AuditAction.WEB_LOGIN_DENIED, user, user, ip, request_id=request.id,
                          browser_ip=request.ip)
    elif number != request.number:
        request.status = DENIED
        audit_service.log(db, AuditAction.WEB_LOGIN_WRONG_NUMBER, user, user, ip, request_id=request.id,
                          browser_ip=request.ip)
    else:
        request.status = APPROVED
        audit_service.log(db, AuditAction.WEB_LOGIN_APPROVED, user, user, ip, request_id=request.id,
                          browser_ip=request.ip, device_id=device.id)
    return request


def close_for_email_code(db: Session, request: WebLoginRequest, ip: str | None) -> User:
    """Admin without the phone at hand: this request is closed and the email code is used instead."""
    if current_status(request) != PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, _GONE)
    user = request.user
    if user.role != Role.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only Admins can use the email code instead")
    request.status = CLOSED
    request.decided_at = utcnow()
    audit_service.log(db, AuditAction.WEB_LOGIN_EMAIL_FALLBACK, user, user, ip, request_id=request.id)
    return user
