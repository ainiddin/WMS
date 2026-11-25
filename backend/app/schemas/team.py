from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.common import Name, Password, Phone


class InvitationCreate(BaseModel):
    role: Literal["WORKER", "MANAGER"]  # never ADMIN: nobody is invited above the Manager rank


class InvitationOut(BaseModel):
    id: int
    role: str
    status: Literal["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]
    team_manager_id: int | None
    team_name: str | None
    invited_by_id: int
    invited_by_email: str
    created_at: datetime
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None
    # Who joined with it (after it was used)
    joined_name: str | None = None
    joined_email: str | None = None
    joined_employee_code: str | None = None

    @classmethod
    def from_invitation(cls, inv) -> "InvitationOut":
        from app.services.invitation_service import status_of  # avoid an import cycle

        joined = inv.accepted_user
        return cls(
            id=inv.id, role=inv.role, status=status_of(inv), team_manager_id=inv.team_manager_id,
            team_name=inv.team_manager.team_name if inv.team_manager else None, invited_by_id=inv.invited_by_id,
            invited_by_email=inv.invited_by.email, created_at=inv.created_at, expires_at=inv.expires_at,
            accepted_at=inv.accepted_at, revoked_at=inv.revoked_at,
            joined_name=joined.full_name if joined else None, joined_email=joined.email if joined else None,
            joined_employee_code=joined.employee.code if joined and joined.employee else None,
        )


class InvitationCreated(InvitationOut):
    """Only right after creating: the link path with its token. It is not stored and is never shown again."""

    link: str


class JoinInfo(BaseModel):
    """What the join page shows before the form (the link is valid)."""

    role: str
    team_name: str | None
    invited_by: str
    expires_at: datetime


class JoinRequest(BaseModel):
    first_name: Name
    last_name: Name
    email: EmailStr  # the work email: the sign in name in the Staff app
    phone: Phone
    password: Password

    @field_validator("email")
    @classmethod
    def lower(cls, value: str) -> str:
        return value.strip().lower()


class TeamMemberOut(BaseModel):
    user_id: int
    employee_id: int
    code: str
    full_name: str
    email: str
    phone: str | None
    role: str
    status: str
    is_active: bool
    created_at: datetime
