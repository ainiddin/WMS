from typing import Annotated

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.security import create_token, decode_token, verify_password
from app.models import User, UserStatus
from app.schemas.auth import CustomerRegister, RefreshRequest, StaffRegister, StaffRegistered, TokenPair, UserOut
from app.services import user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])

STATUS_MESSAGES = {
    UserStatus.PENDING: "Account is waiting for admin approval",
    UserStatus.REJECTED: "Access denied",
    UserStatus.BLOCKED: "Access denied",
}


def _tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_token(user.id, user.role, "access"),
        refresh_token=create_token(user.id, user.role, "refresh"),
        user=UserOut.from_user(user),
    )


@router.post("/register/", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register_customer(data: CustomerRegister, db: DB):
    """Customer sign up: the account is ACTIVE at once and tokens are returned (no separate login needed)."""
    user = user_service.register_customer(db, data)
    db.commit()
    return _tokens(user)


@router.post("/register-staff/", response_model=StaffRegistered, status_code=status.HTTP_201_CREATED)
def register_staff(data: StaffRegister, db: DB):
    """Manager / Worker sign up. Status is PENDING: login is possible only after an Admin approves."""
    user = user_service.register_staff(db, data)
    db.commit()
    return StaffRegistered(detail=STATUS_MESSAGES[UserStatus.PENDING], user=UserOut.from_user(user))


@router.post("/login/", response_model=TokenPair)
def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB):
    """OAuth2 form: `username` = email. Only ACTIVE accounts receive a token (rule 8)."""
    email = form.username.strip().lower()
    user = db.scalars(select(User).where(User.email == email)).one_or_none()
    if user is None or not verify_password(form.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, STATUS_MESSAGES[UserStatus(user.status)])
    return _tokens(user)


@router.post("/refresh/", response_model=TokenPair)
def refresh(data: RefreshRequest, db: DB):
    try:
        payload = decode_token(data.refresh_token, "refresh")
        user = db.get(User, int(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token") from None
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    return _tokens(user)


@router.get("/me/", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.from_user(user)
