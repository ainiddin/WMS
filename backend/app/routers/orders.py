from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import DB, CurrentCustomer, CurrentEmployee, CurrentUser
from app.models import Employee, Order, OrderStatus, Role
from app.schemas.orders import OrderCreate, OrderOut, RejectRequest
from app.services import order_service

router = APIRouter(prefix="/api/orders", tags=["orders"])

def _manager(employee: CurrentEmployee) -> Employee:
    if employee.role not in (Role.ADMIN, Role.MANAGER):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a Manager or Admin can do this")
    return employee


Manager = Annotated[Employee, Depends(_manager)]


def _out(db, order_id: int, staff: bool) -> OrderOut:
    db.expire_all()
    order = db.scalars(order_service.order_query().where(Order.id == order_id)).one()
    return OrderOut.from_order(order, staff_view=staff)


@router.get("/", response_model=list[OrderOut])
def list_orders(
    db: DB,
    user: CurrentUser,
    order_status: Annotated[OrderStatus | None, Query(alias="status")] = None,
    customer: int | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Customers see only their own orders. Workers use `?status=APPROVED` for "Orders to ship"."""
    stmt = order_service.order_query()
    staff = user.role != Role.CUSTOMER
    if not staff:
        if user.customer is None:
            return []
        stmt = stmt.where(Order.customer_id == user.customer.id)
    elif customer:
        stmt = stmt.where(Order.customer_id == customer)
    if order_status:
        stmt = stmt.where(Order.status == order_status)
    # Oldest first for the work queues, newest first for history.
    queue = order_status in (OrderStatus.PENDING, OrderStatus.APPROVED)
    stmt = stmt.order_by(Order.created_at.asc() if queue else Order.created_at.desc()).limit(limit).offset(offset)
    return [OrderOut.from_order(o, staff_view=staff) for o in db.scalars(stmt).all()]


@router.post("/", response_model=OrderOut, status_code=201)
def create_order(data: OrderCreate, db: DB, customer: CurrentCustomer):
    order = order_service.create_order(db, customer, data)
    db.commit()
    return _out(db, order.id, staff=False)


@router.get("/{order_id}/", response_model=OrderOut)
def get_order(order_id: int, db: DB, user: CurrentUser):
    order = order_service.get_order(db, order_id)
    staff = user.role != Role.CUSTOMER
    # A customer asking for someone else's order gets 404, so order ids cannot be probed.
    if not staff and (user.customer is None or order.customer_id != user.customer.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return _out(db, order.id, staff)


@router.post("/{order_id}/approve/", response_model=OrderOut)
def approve_order(order_id: int, db: DB, manager: Manager):
    order = order_service.get_order(db, order_id, lock=True)
    order_service.approve_order(db, order, manager)
    db.commit()
    return _out(db, order.id, staff=True)


@router.post("/{order_id}/reject/", response_model=OrderOut)
def reject_order(order_id: int, db: DB, manager: Manager, data: RejectRequest | None = None):
    order = order_service.get_order(db, order_id, lock=True)
    order_service.reject_order(db, order, manager, data.reason if data else None)
    db.commit()
    return _out(db, order.id, staff=True)


@router.post("/{order_id}/ship/", response_model=OrderOut)
def ship_order(order_id: int, db: DB, employee: CurrentEmployee):
    """One transaction: OUT for every line + status SHIPPED. Any shortage rolls everything back."""
    order = order_service.get_order(db, order_id, lock=True)
    order_service.ship_order(db, order, employee)
    db.commit()
    return _out(db, order.id, staff=True)


@router.post("/{order_id}/cancel/", response_model=OrderOut)
def cancel_order(order_id: int, db: DB, user: CurrentUser):
    """Customer: own order, only while PENDING. Manager/Admin: PENDING or APPROVED."""
    order = order_service.get_order(db, order_id, lock=True)
    if user.role == Role.CUSTOMER:
        if user.customer is None or order.customer_id != user.customer.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
        order_service.cancel_order(db, order, by_customer=True)
    elif user.role in (Role.ADMIN, Role.MANAGER):
        order_service.cancel_order(db, order, by_customer=False)
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workers cannot cancel orders")
    db.commit()
    return _out(db, order.id, staff=user.role != Role.CUSTOMER)
