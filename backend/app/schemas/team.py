from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator

from app.schemas.auth import EmailCode
from app.schemas.common import Name, Password, Phone


class InvitationCreate(BaseModel):
    email: EmailStr
    full_name: Name
    role: Literal["WORKER", "MANAGER"]  # never ADMIN: nobody is invited above the Manager rank

    @field_validator("email")
    @classmethod
    def lower(cls, value: str) -> str:
        return value.strip().lower()


class InvitationOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    status: Literal["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"]
    team_manager_id: int | None
    team_name: str | None
    invited_by_id: int
    invited_by_email: str
    created_at: datetime
    code_sent_at: datetime
    expires_at: datetime
    accepted_at: datetime | None
    revoked_at: datetime | None

    @classmethod
    def from_invitation(cls, inv) -> "InvitationOut":
        from app.services.invitation_service import status_of  # avoid an import cycle

        return cls(
            id=inv.id, email=inv.email, full_name=inv.full_name, role=inv.role, status=status_of(inv),
            team_manager_id=inv.team_manager_id, team_name=inv.team_manager.team_name if inv.team_manager else None,
            invited_by_id=inv.invited_by_id, invited_by_email=inv.invited_by.email, created_at=inv.created_at,
            code_sent_at=inv.code_sent_at, expires_at=inv.expires_at, accepted_at=inv.accepted_at,
            revoked_at=inv.revoked_at,
        )


class InvitationAccept(BaseModel):
    email: str
    code: EmailCode
    password: Password
    phone: Phone | None = None


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
