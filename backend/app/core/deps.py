from collections.abc import Callable
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.rate_limit import client_ip
from app.core.security import decode_token
from app.db.session import get_db
from app.models import Customer, DeviceStatus, Employee, Role, StaffDevice, User, UserStatus
from app.models.common import STAFF_ROLES

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login/")
optional_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login/", auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def _ip(request: Request) -> str:
    return client_ip(request)


ClientIP = Annotated[str, Depends(_ip)]

_credentials_error = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def check_staff_device(db: Session, user: User, device_id: object, web_session: object = None) -> None:
    """Staff tokens are bound to an approved phone. A token without one (e.g. made before a customer
    was promoted) or from a phone the Admin has blocked stops working at once.

    Admin is the exception on the website: a token with a `web` session end (only issued after the email code).
    Admin tokens from a phone also need that phone to have passed the email code once.
    """
    if user.role not in STAFF_ROLES:
        return
    if user.role == Role.ADMIN and device_id is None and isinstance(web_session, int):
        return  # the JWT `exp` already stops it at the session end
    device = db.get(StaffDevice, device_id) if isinstance(device_id, int) else None
    if device is None or device.user_id != user.id or device.status != DeviceStatus.APPROVED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Staff access is allowed only from an approved phone")
    if user.role == Role.ADMIN and device.two_factor_at is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Sign in again: this phone has not passed the email code")


# With an expired Admin password only these work: see who I am, and change the password.
PASSWORD_EXPIRED_ALLOWED = {"/api/auth/me/", "/api/auth/password/"}


def token_older_than_password(payload: dict, user: User) -> bool:
    """A password change signs out every session made before it (iat is in whole seconds)."""
    return int(payload.get("iat", 0)) < int(user.password_changed_at.timestamp())


def _user_from_token(db: Session, token: str, path: str | None = None) -> User:
    try:
        payload = decode_token(token, "access")
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _credentials_error from None
    user = db.get(User, user_id)
    if user is None or token_older_than_password(payload, user):
        raise _credentials_error
    # Checked on every request, so a BLOCKED user loses access at once, not when the token expires.
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")
    check_staff_device(db, user, payload.get("dev"), payload.get("web"))
    user.device_id = payload.get("dev")  # not a column: lets an Admin see which phone he is on
    if path is not None and path not in PASSWORD_EXPIRED_ALLOWED:
        from app.services.user_service import password_expired  # avoid an import cycle

        if password_expired(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Your password has expired. Change it to continue.",
                                headers={"X-Password-Expired": "1"})
    return user


def get_current_user(db: DB, request: Request, token: Annotated[str, Depends(oauth2_scheme)]) -> User:
    return _user_from_token(db, token, request.url.path)


def get_optional_user(
    db: DB, request: Request, token: Annotated[str | None, Depends(optional_oauth2_scheme)]
) -> User | None:
    return _user_from_token(db, token, request.url.path) if token else None


CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


def require_role(*roles: Role) -> Callable[..., User]:
    """Dependency: allow only users whose role is in `roles`. This is the real protection, not the React routes."""

    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission for this action")
        return user

    return checker


def get_current_employee(user: Annotated[User, Depends(require_role(Role.ADMIN, Role.MANAGER, Role.WORKER))]) -> Employee:
    if user.employee is None or not user.employee.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No active employee record for this account")
    return user.employee


def get_current_customer(user: Annotated[User, Depends(require_role(Role.CUSTOMER))]) -> Customer:
    if user.customer is None or not user.customer.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No active customer record for this account")
    return user.customer


CurrentEmployee = Annotated[Employee, Depends(get_current_employee)]
CurrentCustomer = Annotated[Customer, Depends(get_current_customer)]

AdminOnly = Depends(require_role(Role.ADMIN))
ManagerOrAdmin = Depends(require_role(Role.ADMIN, Role.MANAGER))
StaffOnly = Depends(require_role(Role.ADMIN, Role.MANAGER, Role.WORKER))
