from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, require_role
from app.models import Employee, Role, User, UserStatus
from app.schemas.people import AdminUserOut, ApproveRequest, ChangeRoleRequest, EmployeeOut, TeamChangeRequest
from app.services import user_service

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
def approve_user(user_id: int, data: ApproveRequest, db: DB, admin: Admin):
    """Approve a PENDING Manager/Worker. The Admin picks the final role and, for a Worker, the team (manager_id)."""
    user = user_service.approve_staff(db, user_service.get_user(db, user_id), Role(data.role), data.manager_id, admin)
    db.commit()
    return user


@router.post("/users/{user_id}/reject/", response_model=AdminUserOut)
def reject_user(user_id: int, db: DB, admin: Admin):
    user = user_service.reject_staff(db, user_service.get_user(db, user_id), admin)
    db.commit()
    return user


@router.post("/users/{user_id}/block/", response_model=AdminUserOut)
def block_user(user_id: int, db: DB, admin: Admin):
    user = user_service.block_user(db, user_service.get_user(db, user_id), admin)
    db.commit()
    return user


@router.post("/users/{user_id}/unblock/", response_model=AdminUserOut)
def unblock_user(user_id: int, db: DB, _: Admin):
    user = user_service.unblock_user(db, user_service.get_user(db, user_id))
    db.commit()
    return user


@router.patch("/users/{user_id}/role/", response_model=AdminUserOut)
def change_role(user_id: int, data: ChangeRoleRequest, db: DB, admin: Admin):
    user = user_service.change_role(db, user_service.get_user(db, user_id), Role(data.role), data.manager_id, admin)
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
def change_team(employee_id: int, data: TeamChangeRequest, db: DB, _: Admin):
    """Move a Worker to another Manager's team."""
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    user_service.change_team(db, employee, data.manager_id)
    db.commit()
    return employee
