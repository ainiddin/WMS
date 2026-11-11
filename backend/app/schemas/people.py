from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.schemas.common import Money, Name, ORMModel, Phone


class CustomerOut(ORMModel):
    id: int
    code: str
    full_name: str
    phone: str | None
    address: str | None
    email: str | None
    is_active: bool
    balance: Money


class CustomerUpdateMe(BaseModel):
    full_name: Name | None = None
    phone: Phone | None = None
    address: str | None = None


class EmployeeOut(ORMModel):
    id: int
    code: str
    user_id: int
    full_name: str
    role: str
    phone: str | None
    manager_id: int | None
    team_name: str
    is_active: bool


# ---- Admin actions ----
class ApproveRequest(BaseModel):
    role: Literal["MANAGER", "WORKER"]
    # Required when role = WORKER: the Manager (employee id) whose team the Worker joins.
    manager_id: int | None = None


class ChangeRoleRequest(BaseModel):
    role: Literal["ADMIN", "MANAGER", "WORKER"]
    manager_id: int | None = None


class TeamChangeRequest(BaseModel):
    manager_id: int


class AdminUserOut(ORMModel):
    id: int
    email: str
    full_name: str
    phone: str | None
    role: str
    status: str
    requested_role: str | None
    created_at: datetime
    approved_at: datetime | None
    employee: EmployeeOut | None
