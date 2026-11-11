"""Accounts: sign up, admin approval, roles and teams."""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models import Account, Customer, Employee, Role, User, UserStatus
from app.models.common import utcnow
from app.schemas.auth import CustomerRegister, StaffRegister
from app.services import assignment_service, email_service


def _ensure_email_free(db: Session, email: str) -> None:
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already registered")


def send_signup_code(db: Session, email: str) -> None:
    _ensure_email_free(db, email)
    email_service.send_code(db, email)


def register_customer(db: Session, data: CustomerRegister) -> User:
    _ensure_email_free(db, data.email)
    email_service.check_code(db, data.email, data.code)
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        role=Role.CUSTOMER,
        status=UserStatus.ACTIVE,
    )
    user.customer = Customer(full_name=data.full_name, phone=data.phone, address=data.address, account=Account())
    db.add(user)
    db.flush()
    return user


def register_staff(db: Session, data: StaffRegister) -> User:
    _ensure_email_free(db, data.email)
    email_service.check_code(db, data.email, data.code)
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
        # The final role is set by the Admin on approval; until then the account cannot log in.
        role=data.requested_role,
        requested_role=data.requested_role,
        status=UserStatus.PENDING,
    )
    db.add(user)
    db.flush()
    return user


def get_user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


def get_manager(db: Session, manager_id: int | None) -> Employee:
    """Rule 9: a Worker's manager must be an active employee with role MANAGER."""
    if manager_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "A Worker must be assigned to a Manager's team")
    manager = db.get(Employee, manager_id)
    if manager is None or manager.role != Role.MANAGER or not manager.is_active:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "manager_id must point to an active Manager")
    return manager


def approve_staff(db: Session, user: User, role: Role, manager_id: int | None, admin: User) -> User:
    if user.status != UserStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"User is {user.status}, only PENDING can be approved")
    if user.role == Role.CUSTOMER:
        raise HTTPException(status.HTTP_409_CONFLICT, "Customers do not need approval")
    manager = get_manager(db, manager_id) if role == Role.WORKER else None

    user.role = role
    user.status = UserStatus.ACTIVE
    user.approved_by_id = admin.id
    user.approved_at = utcnow()
    # The EMPLOYEES row (E001...) is created at the moment of approval.
    user.employee = Employee(
        full_name=user.full_name,
        phone=user.phone,
        role=role,
        manager_id=manager.id if manager else None,
    )
    db.flush()
    if role == Role.WORKER:  # a new pair of hands: open orders are spread again
        assignment_service.rebalance(db)
    return user


def reject_staff(db: Session, user: User, admin: User) -> User:
    if user.status != UserStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, f"User is {user.status}, only PENDING can be rejected")
    user.status = UserStatus.REJECTED
    user.approved_by_id = admin.id
    user.approved_at = utcnow()
    return user


def block_user(db: Session, user: User, admin: User) -> User:
    if user.id == admin.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot block yourself")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status.HTTP_409_CONFLICT, f"User is {user.status}, only ACTIVE can be blocked")
    user.status = UserStatus.BLOCKED
    # History (movements, orders) stays; the record is only marked inactive.
    if user.employee:
        user.employee.is_active = False
    if user.customer:
        user.customer.is_active = False
    if user.role == Role.WORKER:  # his open orders go to the other Workers
        assignment_service.rebalance(db)
    return user


def unblock_user(db: Session, user: User) -> User:
    if user.status != UserStatus.BLOCKED:
        raise HTTPException(status.HTTP_409_CONFLICT, f"User is {user.status}, only BLOCKED can be unblocked")
    user.status = UserStatus.ACTIVE
    if user.employee:
        user.employee.is_active = True
    if user.customer:
        user.customer.is_active = True
    if user.role == Role.WORKER:
        assignment_service.rebalance(db)
    return user


def change_role(db: Session, user: User, role: Role, manager_id: int | None, admin: User) -> User:
    employee = user.employee
    if user.status != UserStatus.ACTIVE or employee is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Role can be changed only for an active employee")
    if user.id == admin.id and role != Role.ADMIN:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own Admin role")
    if employee.role == Role.MANAGER and role != Role.MANAGER and employee.workers:
        raise HTTPException(status.HTTP_409_CONFLICT, "Move this Manager's Workers to another team first")
    manager = get_manager(db, manager_id) if role == Role.WORKER else None
    if manager and manager.id == employee.id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "An employee cannot be his own manager")

    was_worker = employee.role == Role.WORKER
    user.role = role
    employee.role = role
    employee.manager_id = manager.id if manager else None
    if was_worker or role == Role.WORKER:  # the set of Workers changed
        assignment_service.rebalance(db)
    return user


def change_team(db: Session, employee: Employee, manager_id: int) -> Employee:
    if employee.role != Role.WORKER:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only Workers belong to a team")
    manager = get_manager(db, manager_id)
    employee.manager_id = manager.id
    return employee


def ensure_first_admin(db: Session) -> User | None:
    """Creates Admin001@wms.kz from .env if there is no ADMIN yet. Returns the new admin or None."""
    if db.scalar(select(User.id).where(User.role == Role.ADMIN).limit(1)) is not None:
        return None
    if not settings.ADMIN_PASSWORD:
        raise RuntimeError("No ADMIN user exists and ADMIN_PASSWORD is not set in .env")
    email = settings.ADMIN_EMAIL.strip().lower()
    admin = User(
        email=email,
        password_hash=hash_password(settings.ADMIN_PASSWORD),
        full_name=settings.ADMIN_FULL_NAME,
        role=Role.ADMIN,
        status=UserStatus.ACTIVE,
        approved_at=utcnow(),
    )
    # Admin also gets an EMPLOYEES row, because movements and approvals reference an employee.
    admin.employee = Employee(full_name=settings.ADMIN_FULL_NAME, role=Role.ADMIN)
    db.add(admin)
    db.flush()
    return admin
