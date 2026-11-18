from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.core.config import settings

TokenType = Literal["access", "refresh"]


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=settings.BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_token(
    user_id: int,
    role: str,
    token_type: TokenType,
    device_id: int | None = None,
    session_ends: datetime | None = None,
) -> str:
    """`device_id` is set for staff: the token works only while that phone stays approved.

    `session_ends` is set for an Admin on the website (after the email code): a hard end of the session. No token,
    not even one made by refresh, lives past it, so after ADMIN_WEB_SESSION_HOURS the Admin signs in again.
    """
    if token_type == "access":
        lifetime = timedelta(minutes=settings.ACCESS_TOKEN_MINUTES)
    else:
        lifetime = timedelta(days=settings.REFRESH_TOKEN_DAYS)
    now = datetime.now(UTC)
    exp = now + lifetime
    payload = {"sub": str(user_id), "role": role, "type": token_type, "iat": now}
    if device_id is not None:
        payload["dev"] = device_id
    if session_ends is not None:
        payload["web"] = int(session_ends.timestamp())
        exp = min(exp, session_ends)
    payload["exp"] = exp
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> dict:
    """Raises jwt.PyJWTError if the token is invalid, expired or of the wrong type."""
    payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Wrong token type")
    return payload
