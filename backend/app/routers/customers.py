from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentCustomer, require_role
from app.models import Customer, Role, User
from app.schemas.people import CustomerOut, CustomerUpdateMe

router = APIRouter(prefix="/api/customers", tags=["customers"])

ManagerOrAdmin = Annotated[User, Depends(require_role(Role.ADMIN, Role.MANAGER))]


@router.get("/", response_model=list[CustomerOut])
def list_customers(db: DB, _: ManagerOrAdmin, search: str | None = None, include_inactive: bool = False):
    """Customer contacts: Manager and Admin only (Workers do not see contacts)."""
    stmt = select(Customer).options(selectinload(Customer.user)).order_by(Customer.id)
    if not include_inactive:
        stmt = stmt.where(Customer.is_active)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(Customer.full_name.ilike(like) | Customer.phone.ilike(like))
    return db.scalars(stmt).all()


@router.get("/me/", response_model=CustomerOut)
def my_profile(customer: CurrentCustomer):
    return customer


@router.patch("/me/", response_model=CustomerOut)
def update_my_profile(data: CustomerUpdateMe, db: DB, customer: CurrentCustomer):
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(customer, field, value)
    if data.full_name:
        customer.user.full_name = data.full_name
    if data.phone:
        customer.user.phone = data.phone
    db.commit()
    return customer


@router.get("/{customer_id}/", response_model=CustomerOut)
def get_customer(customer_id: int, db: DB, _: ManagerOrAdmin):
    customer = db.get(Customer, customer_id)
    if customer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")
    return customer
