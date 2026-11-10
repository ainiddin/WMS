from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import Name, ORMModel, Password, Phone


def _normalize_email(value: str) -> str:
    return value.strip().lower()


# 6-digit code from the confirmation email (POST /api/auth/send-code/).
EmailCode = Annotated[str, Field(pattern=r"^\d{6}$")]


class SendCodeRequest(BaseModel):
    email: EmailStr

    _email = field_validator("email")(_normalize_email)


class CustomerRegister(BaseModel):
    email: EmailStr
    code: EmailCode
    password: Password
    full_name: Name
    phone: Phone | None = None
    address: str | None = None

    _email = field_validator("email")(_normalize_email)


class StaffRegister(BaseModel):
    email: EmailStr
    code: EmailCode
    password: Password
    full_name: Name
    phone: Phone | None = None
    # ADMIN cannot be requested: only another Admin can give it.
    requested_role: Literal["MANAGER", "WORKER"]

    _email = field_validator("email")(_normalize_email)


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    phone: str | None
    role: str
    status: str
    requested_role: str | None
    created_at: datetime
    approved_at: datetime | None
    employee_id: int | None = None
    employee_code: str | None = None
    manager_id: int | None = None
    customer_id: int | None = None
    customer_code: str | None = None

    @classmethod
    def from_user(cls, user) -> "UserOut":
        out = cls.model_validate(user)
        if user.employee:
            out.employee_id = user.employee.id
            out.employee_code = user.employee.code
            out.manager_id = user.employee.manager_id
        if user.customer:
            out.customer_id = user.customer.id
            out.customer_code = user.customer.code
        return out


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    user: UserOut


class StaffRegistered(BaseModel):
    detail: str
    user: UserOut
