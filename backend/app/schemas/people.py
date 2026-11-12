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


class StaffDeviceOut(ORMModel):
    id: int
    device_name: str
    status: str
    created_at: datetime
    approved_at: datetime | None
    last_seen_at: datetime | None
    user_id: int
    user_email: str
    user_full_name: str
    user_role: str
    # True for the phone the Admin is using right now (it cannot be blocked from itself).
    current: bool = False

    @classmethod
    def from_device(cls, device, current_device_id: int | None) -> "StaffDeviceOut":
        return cls(
            id=device.id, device_name=device.device_name, status=device.status, created_at=device.created_at,
            approved_at=device.approved_at, last_seen_at=device.last_seen_at, user_id=device.user_id,
            user_email=device.user.email, user_full_name=device.user.full_name, user_role=device.user.role,
            current=device.id == current_device_id,
        )
