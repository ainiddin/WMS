from datetime import date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core import rate_limit
from app.core.deps import DB, ClientIP, require_role
from app.models import AuditAction, AuditLog, DeviceStatus, Employee, Invitation, Role, StaffDevice, User, UserStatus
from app.schemas.people import (
    AdminUserOut,
    ApproveRequest,
    AuditLogOut,
    ChangeRoleRequest,
    EmployeeOut,
    StaffDeviceOut,
    TeamChangeRequest,
)
from app.schemas.team import InvitationCreate, InvitationOut
from app.schemas.accounts import AdminPaymentOut, PaymentsSummaryOut
from app.services import (audit_service, device_service, invitation_service, payment_gateway, payment_service,
                          user_service)
from app.services.timeutil import local_tz

router = APIRouter(prefix="/api/admin", tags=["admin"])

Admin = Annotated[User, Depends(require_role(Role.ADMIN))]


@router.get("/users/", response_model=list[AdminUserOut])
def list_users(
    db: DB,
    _: Admin,
    user_status: Annotated[UserStatus | None, Query(alias="status")] = None,
    role: Role | None = None,
    search: str | None = None,
):
    """All accounts. `?status=PENDING` = staff waiting for approval."""
    stmt = select(User).options(selectinload(User.employee)).order_by(User.created_at.desc())
    if user_status:
        stmt = stmt.where(User.status == user_status)
    if role:
        stmt = stmt.where(User.role == role)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(User.email.ilike(like) | User.full_name.ilike(like))
    return db.scalars(stmt).all()


@router.post("/users/{user_id}/approve/", response_model=AdminUserOut)
def approve_user(user_id: int, data: ApproveRequest, db: DB, admin: Admin, ip: ClientIP):
    """Approve a PENDING Manager/Worker. The Admin picks the final role and, for a Worker, the team (manager_id)."""
    user = user_service.approve_staff(db, user_service.get_user(db, user_id), Role(data.role), data.manager_id, admin)
    audit_service.log(db, AuditAction.USER_APPROVED, admin, user, ip, role=user.role, manager_id=data.manager_id)
    db.commit()
    return user


@router.post("/users/{user_id}/reject/", response_model=AdminUserOut)
def reject_user(user_id: int, db: DB, admin: Admin, ip: ClientIP):
    user = user_service.reject_staff(db, user_service.get_user(db, user_id), admin)
    audit_service.log(db, AuditAction.USER_REJECTED, admin, user, ip)
    db.commit()
    return user


@router.post("/users/{user_id}/block/", response_model=AdminUserOut)
def block_user(user_id: int, db: DB, admin: Admin, ip: ClientIP):
    user = user_service.block_user(db, user_service.get_user(db, user_id), admin)
    audit_service.log(db, AuditAction.USER_BLOCKED, admin, user, ip)
    db.commit()
    return user


@router.post("/users/{user_id}/unblock/", response_model=AdminUserOut)
def unblock_user(user_id: int, db: DB, admin: Admin, ip: ClientIP):
    user = user_service.unblock_user(db, user_service.get_user(db, user_id))
    audit_service.log(db, AuditAction.USER_UNBLOCKED, admin, user, ip)
    db.commit()
    return user


@router.post("/users/{user_id}/clear-login-timer/", response_model=AdminUserOut)
def clear_login_timer(user_id: int, db: DB, admin: Admin, ip: ClientIP):
    """Unlock an account after too many wrong passwords: the failed-login counter of its email is cleared,
    so the user may sign in at once instead of waiting for the timer (HTTP 429 / Retry-After)."""
    user = user_service.get_user(db, user_id)
    failures, _ = rate_limit.login_timer(user.email)
    rate_limit.clear_login_timer(user.email)
    audit_service.log(db, AuditAction.LOGIN_TIMER_CLEARED, admin, user, ip, failed_logins=failures)
    db.commit()
    return user


@router.patch("/users/{user_id}/role/", response_model=AdminUserOut)
def change_role(user_id: int, data: ChangeRoleRequest, db: DB, admin: Admin, ip: ClientIP):
    user = user_service.get_user(db, user_id)
    old_role = user.role
    old_manager = user.employee.manager_id if user.employee else None
    user = user_service.change_role(db, user, Role(data.role), data.manager_id, admin)
    audit_service.log(db, AuditAction.ROLE_CHANGED, admin, user, ip, old_role=old_role, new_role=user.role,
                      old_manager_id=old_manager, new_manager_id=user.employee.manager_id)
    db.commit()
    return user


@router.get("/employees/", response_model=list[EmployeeOut])
def list_employees(db: DB, _: Admin, role: Role | None = None, manager_id: int | None = None):
    """Use `?role=MANAGER` to fill the team picker in the approval dialog."""
    stmt = select(Employee).order_by(Employee.id)
    if role:
        stmt = stmt.where(Employee.role == role)
    if manager_id:
        stmt = stmt.where(Employee.manager_id == manager_id)
    return db.scalars(stmt).all()


@router.patch("/employees/{employee_id}/team/", response_model=EmployeeOut)
def change_team(employee_id: int, data: TeamChangeRequest, db: DB, admin: Admin, ip: ClientIP):
    """Move a Worker to another Manager's team."""
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    old_manager = employee.manager_id
    user_service.change_team(db, employee, data.manager_id)
    audit_service.log(db, AuditAction.TEAM_CHANGED, admin, employee.user, ip,
                      old_manager_id=old_manager, new_manager_id=employee.manager_id)
    db.commit()
    return employee


# ---- Staff phones ----
@router.get("/devices/", response_model=list[StaffDeviceOut])
def list_devices(db: DB, admin: Admin, device_status: Annotated[DeviceStatus | None, Query(alias="status")] = None):
    """Phones staff signed in from. `?status=PENDING` = phones waiting for approval."""
    stmt = select(StaffDevice).options(selectinload(StaffDevice.user)).order_by(StaffDevice.created_at.desc())
    if device_status:
        stmt = stmt.where(StaffDevice.status == device_status)
    return [StaffDeviceOut.from_device(d, admin.device_id) for d in db.scalars(stmt)]


@router.post("/devices/{device_id}/approve/", response_model=StaffDeviceOut)
def approve_device(device_id: int, db: DB, admin: Admin, ip: ClientIP):
    device = device_service.approve(device_service.get_device(db, device_id), admin)
    audit_service.log(db, AuditAction.DEVICE_APPROVED, admin, device.user, ip,
                      device_id=device.id, device_name=device.device_name)
    db.commit()
    return StaffDeviceOut.from_device(device, admin.device_id)


@router.post("/devices/{device_id}/revoke/", response_model=StaffDeviceOut)
def revoke_device(device_id: int, db: DB, admin: Admin, ip: ClientIP):
    """Block a phone (lost, stolen, unknown request). Its tokens stop working at once."""
    device = device_service.revoke(device_service.get_device(db, device_id), admin, admin.device_id)
    audit_service.log(db, AuditAction.DEVICE_REVOKED, admin, device.user, ip,
                      device_id=device.id, device_name=device.device_name)
    db.commit()
    return StaffDeviceOut.from_device(device, admin.device_id)


# ---- Audit log ----
@router.get("/payments/", response_model=PaymentsSummaryOut)
def payments(db: DB, _: Admin):
    """Money received by card top-ups (read only; nobody can withdraw)."""
    data = payment_service.summary(db)
    return PaymentsSummaryOut(gateway=payment_gateway.NAME, total=data["total"], today=data["today"],
                              payments=[AdminPaymentOut.from_payment(p) for p in data["payments"]])


@router.get("/audit/", response_model=list[AuditLogOut])
def audit_log(
    db: DB,
    _: Admin,
    action: AuditAction | None = None,
    actor_id: int | None = None,
    target_user_id: int | None = None,
    user_id: Annotated[int | None, Query(description="Actor OR target")] = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Newest first. Dates are calendar days in the shop time zone, both ends included."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "date_from must not be after date_to")
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if target_user_id:
        stmt = stmt.where(AuditLog.target_user_id == target_user_id)
    if user_id:
        stmt = stmt.where((AuditLog.actor_id == user_id) | (AuditLog.target_user_id == user_id))
    if date_from:
        stmt = stmt.where(AuditLog.created_at >= datetime.combine(date_from, time.min, local_tz()))
    if date_to:
        stmt = stmt.where(AuditLog.created_at < datetime.combine(date_to + timedelta(days=1), time.min, local_tz()))
    stmt = stmt.order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit).offset(offset)
    return db.scalars(stmt).all()


# ---- Invitations (Managers invite; the Admin sees all and can step in) ----
@router.get("/invitations/", response_model=list[InvitationOut])
def all_invitations(
    db: DB,
    _: Admin,
    invited_by_id: int | None = None,
    invitation_status: Annotated[str | None, Query(alias="status", pattern="^(PENDING|ACCEPTED|REVOKED|EXPIRED)$")] = None,
):
    stmt = select(Invitation).order_by(Invitation.created_at.desc())
    if invited_by_id:
        stmt = stmt.where(Invitation.invited_by_id == invited_by_id)
    rows = [InvitationOut.from_invitation(i) for i in db.scalars(stmt)]
    return [r for r in rows if invitation_status is None or r.status == invitation_status]


@router.post("/invitations/", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
def invite_first_manager(data: InvitationCreate, db: DB, admin: Admin, ip: ClientIP):
    """Only while the company has no active Manager: someone must invite the first one."""
    invitation = invitation_service.create(db, admin, data.email, data.full_name, Role(data.role), ip)
    db.commit()
    return InvitationOut.from_invitation(invitation)


@router.post("/invitations/{invitation_id}/revoke/", response_model=InvitationOut)
def revoke_invitation(invitation_id: int, db: DB, admin: Admin, ip: ClientIP):
    invitation = invitation_service.revoke(db, invitation_service.get(db, invitation_id), admin, ip)
    db.commit()
    return InvitationOut.from_invitation(invitation)


@router.post("/invitations/{invitation_id}/resend/", response_model=InvitationOut)
def resend_invitation(invitation_id: int, db: DB, admin: Admin, ip: ClientIP):
    invitation = invitation_service.resend(db, invitation_service.get(db, invitation_id), admin, ip)
    db.commit()
    return InvitationOut.from_invitation(invitation)
