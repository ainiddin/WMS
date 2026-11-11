from collections import Counter
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.deps import DB, CurrentCustomer, CurrentEmployee, CurrentUser
from app.models import Employee, Order, OrderStatus, Role
from app.schemas.orders import (
    OrderCreate,
    OrderOut,
    PersonShort,
    RebalanceOut,
    RejectRequest,
    StockCheckOut,
    WaitingLine,
    WorkerLoadOut,
)
from app.services import assignment_service, eta_service, order_service

router = APIRouter(prefix="/api/orders", tags=["orders"])

def _manager(employee: CurrentEmployee) -> Employee:
    if employee.role not in (Role.ADMIN, Role.MANAGER):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a Manager or Admin can do this")
    return employee


Manager = Annotated[Employee, Depends(_manager)]


def _outs(db, orders: list[Order], staff: bool) -> list[OrderOut]:
    """Waiting orders also get what they miss and the expected wait (computed from the queue, not stored)."""
    pending = [o for o in orders if o.status == OrderStatus.PENDING]
    missing: dict = {}
    if pending:
        _, missing, _ = order_service.queue_state(db, {i.product_id for o in pending for i in o.items})
    etas: dict[int, eta_service.Eta] = {}

    def eta(product_ids):
        for pid in product_ids:
            if pid not in etas:
                etas[pid] = eta_service.product_eta(db, pid)
        if not product_ids:
            return None
        return eta_service.Eta(max(etas[p].min_days for p in product_ids), max(etas[p].max_days for p in product_ids))

    return [
        OrderOut.from_order(o, staff_view=staff, waiting=missing.get(o.id), eta=eta(list(missing.get(o.id, {}))))
        for o in orders
    ]


def _out(db, order_id: int, staff: bool) -> OrderOut:
    db.expire_all()
    order = db.scalars(order_service.order_query().where(Order.id == order_id)).one()
    return _outs(db, [order], staff)[0]


def _workload(db) -> list[WorkerLoadOut]:
    loads = sorted(assignment_service.workloads(db).values(), key=lambda load: load.worker.id)
    return [
        WorkerLoadOut(worker=PersonShort(id=load.worker.id, code=load.worker.code, full_name=load.worker.full_name),
                      team_name=load.worker.manager.team_name if load.worker.manager else "",
                      open_orders=load.orders, open_units=load.units)
        for load in loads
    ]


@router.get("/", response_model=list[OrderOut])
def list_orders(
    db: DB,
    user: CurrentUser,
    order_status: Annotated[OrderStatus | None, Query(alias="status")] = None,
    customer: int | None = None,
    assigned_to: int | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Customers see only their own orders. Workers use `?status=APPROVED` for "Orders to ship"
    (`&assigned_to=<employee id>` for their own queue)."""
    stmt = order_service.order_query()
    staff = user.role != Role.CUSTOMER
    if not staff:
        if user.customer is None:
            return []
        stmt = stmt.where(Order.customer_id == user.customer.id)
    elif customer:
        stmt = stmt.where(Order.customer_id == customer)
    if staff and assigned_to:
        stmt = stmt.where(Order.assigned_to_id == assigned_to)
    if order_status:
        stmt = stmt.where(Order.status == order_status)
    # Oldest first for the work queues, newest first for history.
    queue = order_status in (OrderStatus.PENDING, OrderStatus.APPROVED)
    stmt = stmt.order_by(Order.created_at.asc() if queue else Order.created_at.desc()).limit(limit).offset(offset)
    return _outs(db, list(db.scalars(stmt).all()), staff)


@router.post("/check/", response_model=StockCheckOut)
def check_order(data: OrderCreate, db: DB, _: CurrentCustomer):
    """Checkout preview: which items would wait for a delivery and roughly how long. Nothing is saved."""
    wanted: Counter[int] = Counter()
    for item in data.items:
        wanted[item.product_id] += item.quantity
    _, missing, products = order_service.queue_state(db, wanted.keys(), extra=wanted)
    short = missing.get(None, {})
    eta = eta_service.order_eta(db, short.keys())
    return StockCheckOut(
        waiting=[WaitingLine(product_id=pid, product_code=products[pid].code,
                             product_name=products[pid].product_name, missing=n)
                 for pid, n in short.items() if pid in products],
        eta_min_days=eta.min_days if eta else None,
        eta_max_days=eta.max_days if eta else None,
    )


@router.get("/workload/", response_model=list[WorkerLoadOut])
def workload(db: DB, _: Manager):
    """Open work of every active Worker: approved orders and units still to ship."""
    return _workload(db)


@router.post("/rebalance/", response_model=RebalanceOut)
def rebalance(db: DB, _: Manager):
    """Spreads all open orders evenly between the active Workers again."""
    moved = assignment_service.rebalance(db)
    db.commit()
    return RebalanceOut(moved=moved, workload=_workload(db))


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
    """Customer: own order; Manager/Admin: any order. Possible until it is shipped; the money is refunded."""
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
