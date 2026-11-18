from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.core import rate_limit
from app.core.deps import DB, CurrentUser, check_staff_device
from app.core.security import create_token, decode_token, verify_password
from app.models import User, UserStatus
from app.models.common import STAFF_ROLES
from app.schemas.auth import (
    CustomerRegister,
    RefreshRequest,
    SendCodeRequest,
    StaffLogin,
    StaffRegister,
    StaffRegistered,
    TokenPair,
    UserOut,
)
from app.schemas.common import Message
from app.services import device_service, user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

STATUS_MESSAGES = {
    UserStatus.PENDING: "Account is waiting for admin approval",
    UserStatus.REJECTED: "Access denied",
    UserStatus.BLOCKED: "Access denied",
}


def _tokens(user: User, device_id: int | None = None) -> TokenPair:
    return TokenPair(
        access_token=create_token(user.id, user.role, "access", device_id),
        refresh_token=create_token(user.id, user.role, "refresh", device_id),
        user=UserOut.from_user(user),
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


@router.post("/register-staff/", response_model=StaffRegistered, status_code=status.HTTP_201_CREATED)
def register_staff(data: StaffRegister, db: DB, request: Request):
    """Manager / Worker sign up. Status is PENDING: login is possible only after an Admin approves."""
    rate_limit.check_signup(rate_limit.client_ip(request))
    user = user_service.register_staff(db, data)
    db.commit()
    return StaffRegistered(detail=STATUS_MESSAGES[UserStatus.PENDING], user=UserOut.from_user(user))


@router.post("/login/", response_model=TokenPair)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB, request: Request):
    """Website (customers). OAuth2 form: `username` = email. Only ACTIVE accounts receive a token (rule 8).

    Staff accounts are refused here: they work only in the KeyFive Staff app on an approved phone.
    """
    user = _check_password(db, request, form.username, form.password)
    if user.role in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff accounts sign in only in the KeyFive Staff app")
    return _tokens(user)


@router.post("/staff/login/", response_model=TokenPair)
def staff_login(data: StaffLogin, db: DB, request: Request):
    """KeyFive Staff app. Needs the right password AND a phone approved by an Admin (see StaffDevice)."""
    user = _check_password(db, request, data.email, data.password)
    if user.role not in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This app is for warehouse staff only")
    device = device_service.check_in(db, user, data.device_secret, data.device_name)
    db.commit()
    return _tokens(user, device.id)


@router.post("/refresh/", response_model=TokenPair)
def refresh(data: RefreshRequest, db: DB):
    try:
        payload = decode_token(data.refresh_token, "refresh")
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from None
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    check_staff_device(db, user, payload.get("dev"))
    return _tokens(user, payload.get("dev"))


@router.get("/me/", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.from_user(user)
