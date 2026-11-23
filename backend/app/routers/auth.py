from datetime import UTC, datetime, timedelta
from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.core import rate_limit
from app.core.config import settings
from app.core.deps import DB, ClientIP, CurrentUser, check_staff_device, token_older_than_password
from app.core.security import create_token, decode_token, verify_password
from app.models import AuditAction, Role, User, UserStatus
from app.models.common import utcnow
from app.models.common import STAFF_ROLES
from app.schemas.auth import (
    AdminLogin,
    ChangePassword,
    CustomerRegister,
    RefreshRequest,
    SendCodeRequest,
    StaffLogin,
    TokenPair,
    TwoFactorRequired,
    TwoFactorResend,
    TwoFactorVerify,
    UserOut,
    WebLoginStarted,
    WebLoginState,
    WebLoginToken,
)
from app.schemas.common import Message
from app.schemas.team import InvitationAccept
from app.services import (
    audit_service,
    device_service,
    invitation_service,
    two_factor_service,
    user_service,
    web_login_service,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

STATUS_MESSAGES = {
    UserStatus.PENDING: "Account is waiting for admin approval",
    UserStatus.REJECTED: "Access denied",
    UserStatus.BLOCKED: "Access denied",
}


def _tokens(user: User, device_id: int | None = None, session_ends: datetime | None = None) -> TokenPair:
    return TokenPair(
        access_token=create_token(user.id, user.role, "access", device_id, session_ends),
        refresh_token=create_token(user.id, user.role, "refresh", device_id, session_ends),
        user=UserOut.from_user(user),
    )


def _challenge_out(token: str, challenge) -> TwoFactorRequired:
    sent_via, sent_to = two_factor_service.sent_to()
    code_seconds, resend_seconds = two_factor_service.seconds_left(challenge)
    return TwoFactorRequired(
        challenge_token=token,
        sent_to=sent_to,
        sent_via=sent_via,
        code_seconds=code_seconds,
        resend_seconds=resend_seconds,
        expires_at=challenge.expires_at,
    )


def _check_password(db: DB, request: Request, email: str, password: str) -> User:
    """Too many failed attempts for this email or IP -> 429 for a while, even with the right password.
    An Admin can clear the timer of an account (POST /api/admin/users/{id}/clear-login-timer/)."""
    email = email.strip().lower()
    ip = rate_limit.client_ip(request)
    rate_limit.check_login(ip, email)
    user = db.scalars(select(User).where(User.email == email)).one_or_none()
    if user is None or not verify_password(password, user.password_hash):
        rate_limit.login_failed(ip, email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    rate_limit.login_succeeded(email)
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, STATUS_MESSAGES[UserStatus(user.status)])
    return user


@router.post("/send-code/", response_model=Message)
def send_code(data: SendCodeRequest, db: DB, request: Request):
    """Step 1 of any sign up: a 6-digit code is emailed. It proves that the address exists and is the user's."""
    ip = rate_limit.client_ip(request)
    rate_limit.check_send_code(ip)
    user_service.send_signup_code(db, data.email)
    db.commit()
    rate_limit.code_sent(ip)
    return Message(detail=f"A code was sent to {data.email}")


@router.post("/register/", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register_customer(data: CustomerRegister, db: DB, request: Request):
    """Customer sign up: the account is ACTIVE at once and tokens are returned (no separate login needed)."""
    rate_limit.check_signup(rate_limit.client_ip(request))
    user = user_service.register_customer(db, data)
    db.commit()
    return _tokens(user)


@router.post("/invite/accept/", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def accept_invitation(data: InvitationAccept, db: DB, ip: ClientIP):
    """Staff join only by invitation: email + the code from the invitation email + a new password.
    The account is ACTIVE at once (role and team come from the invitation); then sign in in the Staff app,
    where the new phone waits for approval. Wrong codes count as failed logins (brute-force limits)."""
    email = data.email.strip().lower()
    rate_limit.check_login(ip, email)
    try:
        user = invitation_service.accept(db, email, data.code, data.password, data.phone, ip)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_400_BAD_REQUEST:
            rate_limit.login_failed(ip, email)
        raise
    db.commit()
    return UserOut.from_user(user)


@router.post("/login/", response_model=TokenPair)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB, request: Request):
    """Website (customers). OAuth2 form: `username` = email. Only ACTIVE accounts receive a token (rule 8).

    Staff accounts are refused here: they work only in the KeyFive Staff app on an approved phone.
    """
    user = _check_password(db, request, form.username, form.password)
    if user.role in (Role.ADMIN, Role.MANAGER):
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            "Admins and Managers sign in on the Staff sign-in page, confirmed on their phone")
    if user.role in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workers sign in only in the KeyFive Staff app")
    return _tokens(user)


@router.post("/admin/login/", response_model=TwoFactorRequired)
def admin_login(data: AdminLogin, db: DB, request: Request):
    """Admin on the website, step 1 of 2. Right password -> a code goes to the corporate mailbox.
    Same brute-force limits as every login."""
    user = _check_password(db, request, data.email, data.password)
    if user.role != Role.ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This sign in is for Admins only")
    token, challenge = two_factor_service.start(db, user, rate_limit.client_ip(request))
    db.commit()
    return _challenge_out(token, challenge)


@router.post("/2fa/verify/", response_model=TokenPair)
def two_factor_verify(data: TwoFactorVerify, db: DB, request: Request):
    """Step 2: the code. Website -> a session of ADMIN_WEB_SESSION_HOURS. App -> the phone is remembered."""
    challenge = two_factor_service.verify(db, data.challenge_token, data.code, rate_limit.client_ip(request))
    db.commit()
    if challenge.device is not None:
        return _tokens(challenge.user, challenge.device.id)
    return _web_session(challenge.user)


@router.post("/2fa/resend/", response_model=TwoFactorRequired)
def two_factor_resend(data: TwoFactorResend, db: DB, request: Request):
    """Send again: a new code for the same sign in, once per TWO_FACTOR_RESEND_SECONDS."""
    challenge = two_factor_service.resend(db, data.challenge_token, rate_limit.client_ip(request))
    db.commit()
    return _challenge_out(data.challenge_token, challenge)


@router.post("/staff/login/", response_model=TokenPair | TwoFactorRequired,
             responses={202: {"model": TwoFactorRequired, "description": "Admin: enter the email code"}})
def staff_login(data: StaffLogin, db: DB, request: Request, response: Response):
    """KeyFive Staff app. Needs the right password AND a phone approved by an Admin (see StaffDevice).
    An Admin also enters the email code once per phone: then the answer is 202 with a challenge."""
    user = _check_password(db, request, data.email, data.password)
    if user.role not in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This app is for warehouse staff only")
    device = device_service.check_in(db, user, data.device_secret, data.device_name)
    if two_factor_service.needs_challenge(user, device):
        token, challenge = two_factor_service.start(db, user, rate_limit.client_ip(request), device)
        db.commit()
        response.status_code = status.HTTP_202_ACCEPTED
        return _challenge_out(token, challenge)
    db.commit()
    return _tokens(user, device.id)


@router.post("/refresh/", response_model=TokenPair)
def refresh(data: RefreshRequest, db: DB):
    try:
        payload = decode_token(data.refresh_token, "refresh")
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from None
    if user is None or user.status != UserStatus.ACTIVE or token_older_than_password(payload, user):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    check_staff_device(db, user, payload.get("dev"), payload.get("web"))
    # Website session: an Admin keeps the hard end, a Manager's is renewed (web_login_service.session_end).
    session_ends = None
    if "web" in payload:
        session_ends = web_login_service.session_end(user, datetime.fromtimestamp(payload["web"], UTC))
    return _tokens(user, payload.get("dev"), session_ends)


@router.get("/me/", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.from_user(user)


@router.post("/password/", response_model=TokenPair)
def change_password(data: ChangePassword, db: DB, user: CurrentUser, request: Request, ip: ClientIP):
    """Change my password. Every other session (all tokens issued before) stops working; this one gets new tokens.
    A wrong current password counts as a failed login (brute-force limits)."""
    rate_limit.check_login(ip, user.email)
    try:
        user_service.change_password(user, data.old_password, data.new_password)
    except HTTPException as exc:
        if exc.detail == "The current password is wrong":
            rate_limit.login_failed(ip, user.email)
        raise
    audit_service.log(db, AuditAction.PASSWORD_CHANGED, user, user, ip)
    db.commit()
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    payload = decode_token(token, "access")
    session_ends = datetime.fromtimestamp(payload["web"], UTC) if "web" in payload else None
    return _tokens(user, payload.get("dev"), session_ends)


# ---- Website sign in approved on the phone (Admin, Manager) ----
def _web_session(user: User) -> TokenPair:
    return _tokens(user, session_ends=web_login_service.session_end(user))


@router.post("/web/login/", response_model=WebLoginStarted)
def web_login(data: AdminLogin, db: DB, request: Request):
    """Step 1 in the browser: the password. Then the phone shows "Is this you?" with three numbers; the browser
    shows the right one. Admins without an approving phone use the email code (POST /web/email-code/)."""
    user = _check_password(db, request, data.email, data.password)
    token, req, has_phone = web_login_service.start(db, user, rate_limit.client_ip(request),
                                                    request.headers.get("user-agent"))
    db.commit()
    return WebLoginStarted(request_token=token, number=req.number, expires_at=req.expires_at,
                           seconds=settings.WEB_LOGIN_SECONDS, phone_available=has_phone, role=user.role)


@router.post("/web/status/", response_model=WebLoginState)
def web_login_status(data: WebLoginToken, db: DB):
    """The browser asks every few seconds while it waits. Approved -> a website session, handed out once."""
    req = web_login_service.by_token(db, data.request_token)
    user = web_login_service.collect(db, req)
    if user is None:
        return WebLoginState(status="PENDING")
    rate_limit.web_login_passed(user.email)
    db.commit()
    return WebLoginState(status="APPROVED", tokens=_web_session(user))


@router.post("/web/email-code/", response_model=TwoFactorRequired)
def web_login_email_code(data: WebLoginToken, db: DB, ip: ClientIP):
    """Admin without the phone at hand: close the phone request, send the email code instead (no new password)."""
    req = web_login_service.by_token(db, data.request_token)
    user = web_login_service.close_for_email_code(db, req, ip)
    token, challenge = two_factor_service.start(db, user, ip)
    db.commit()
    return _challenge_out(token, challenge)
