"""A Manager runs his own team: invitations, members (block / unblock), their phones.

He sees only his own team: every lookup is limited to Workers whose manager is him, and anything else
answers 404, so he cannot even learn that other people exist.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, ClientIP, require_role
from app.models import AuditAction, DeviceStatus, Employee, Invitation, Role, StaffDevice, User
from app.schemas.people import StaffDeviceOut
from app.schemas.team import InvitationCreate, InvitationOut, TeamMemberOut
from app.services import audit_service, device_service, invitation_service, user_service

router = APIRouter(prefix="/api/team", tags=["team"])

Manager = Annotated[User, Depends(require_role(Role.MANAGER))]


def _member(db: DB, manager: User, user_id: int) -> User:
    """A Worker of this Manager's team, or 404."""
    user = db.get(User, user_id)
    if user is None or user.employee is None or user.employee.manager_id != manager.employee.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such member in your team")
    return user


def _member_out(user: User) -> TeamMemberOut:
    e = user.employee
    return TeamMemberOut(user_id=user.id, employee_id=e.id, code=e.code, full_name=user.full_name, email=user.email,
                         phone=user.phone, role=user.role, status=user.status, is_active=e.is_active,
                         created_at=user.created_at)


# ---- Members ----
@router.get("/members/", response_model=list[TeamMemberOut])
def members(db: DB, manager: Manager):
    stmt = (select(User).join(Employee, Employee.user_id == User.id)
            .where(Employee.manager_id == manager.employee.id).order_by(User.full_name))
    return [_member_out(u) for u in db.scalars(stmt)]


@router.post("/members/{user_id}/block/", response_model=TeamMemberOut)
def block_member(user_id: int, db: DB, manager: Manager, ip: ClientIP):
    user = user_service.block_user(db, _member(db, manager, user_id), manager)
    audit_service.log(db, AuditAction.USER_BLOCKED, manager, user, ip)
    db.commit()
    return _member_out(user)


@router.post("/members/{user_id}/unblock/", response_model=TeamMemberOut)
def unblock_member(user_id: int, db: DB, manager: Manager, ip: ClientIP):
    user = user_service.unblock_user(db, _member(db, manager, user_id))
    audit_service.log(db, AuditAction.USER_UNBLOCKED, manager, user, ip)
    db.commit()
    return _member_out(user)


# ---- Phones of the team ----
def _team_device(db: DB, manager: User, device_id: int) -> StaffDevice:
    device = db.get(StaffDevice, device_id)
    if device is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found")
    _member(db, manager, device.user_id)  # 404 unless the phone belongs to one of his Workers
    return device


@router.get("/devices/", response_model=list[StaffDeviceOut])
def devices(db: DB, manager: Manager, device_status: Annotated[DeviceStatus | None, Query(alias="status")] = None):
    stmt = (select(StaffDevice).options(selectinload(StaffDevice.user))
            .join(Employee, Employee.user_id == StaffDevice.user_id)
            .where(Employee.manager_id == manager.employee.id).order_by(StaffDevice.created_at.desc()))
    if device_status:
        stmt = stmt.where(StaffDevice.status == device_status)
    return [StaffDeviceOut.from_device(d, None) for d in db.scalars(stmt)]


@router.post("/devices/{device_id}/approve/", response_model=StaffDeviceOut)
def approve_device(device_id: int, db: DB, manager: Manager, ip: ClientIP):
    device = device_service.approve(_team_device(db, manager, device_id), manager)
    audit_service.log(db, AuditAction.DEVICE_APPROVED, manager, device.user, ip,
                      device_id=device.id, device_name=device.device_name)
    db.commit()
    return StaffDeviceOut.from_device(device, None)


@router.post("/devices/{device_id}/revoke/", response_model=StaffDeviceOut)
def revoke_device(device_id: int, db: DB, manager: Manager, ip: ClientIP):
    device = device_service.revoke(_team_device(db, manager, device_id), manager, manager.device_id)
    audit_service.log(db, AuditAction.DEVICE_REVOKED, manager, device.user, ip,
                      device_id=device.id, device_name=device.device_name)
    db.commit()
    return StaffDeviceOut.from_device(device, None)


# ---- Invitations ----
@router.get("/invitations/", response_model=list[InvitationOut])
def my_invitations(db: DB, manager: Manager):
    stmt = select(Invitation).where(Invitation.invited_by_id == manager.id).order_by(Invitation.created_at.desc())
    return [InvitationOut.from_invitation(i) for i in db.scalars(stmt)]


@router.post("/invitations/", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
def invite(data: InvitationCreate, db: DB, manager: Manager, ip: ClientIP):
    """WORKER joins your team; MANAGER gets a team of his own."""
    invitation = invitation_service.create(db, manager, data.email, data.full_name, Role(data.role), ip)
    db.commit()
    return InvitationOut.from_invitation(invitation)


@router.post("/invitations/{invitation_id}/resend/", response_model=InvitationOut)
def resend(invitation_id: int, db: DB, manager: Manager, ip: ClientIP):
    invitation = invitation_service.resend(db, invitation_service.get(db, invitation_id), manager, ip)
    db.commit()
    return InvitationOut.from_invitation(invitation)


@router.post("/invitations/{invitation_id}/revoke/", response_model=InvitationOut)
def revoke(invitation_id: int, db: DB, manager: Manager, ip: ClientIP):
    invitation = invitation_service.revoke(db, invitation_service.get(db, invitation_id), manager, ip)
    db.commit()
    return InvitationOut.from_invitation(invitation)
