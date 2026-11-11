"""Order workflow: PENDING (waiting for stock) -> APPROVED -> SHIPPED, with REJECTED / CANCELLED exits.

Nobody has to approve an order by hand: the system approves it as soon as the stock is there and gives it to the
least loaded Worker (assignment_service). Orders that do not fit into the stock wait in a queue, oldest first,
and are approved automatically when goods arrive or other orders are cancelled.

Functions change the session but do not commit; the router commits once.
"""

from collections import Counter
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Customer, Employee, MovementType, Order, OrderItem, OrderStatus, Product
from app.models.common import utcnow
from app.schemas.orders import OrderCreate
from app.services import account_service, assignment_service
from app.services.movement_service import record_movement


def get_order(db: Session, order_id: int, *, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id)
    if lock:
        stmt = stmt.with_for_update()
    order = db.scalars(stmt).one_or_none()
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return order


def _require_status(order: Order, *allowed: OrderStatus) -> None:
    if order.status not in allowed:
        allowed_text = " or ".join(allowed)
        raise HTTPException(
            status.HTTP_409_CONFLICT, f"Order {order.code} is {order.status}; this action needs {allowed_text}"
        )


# ---------------- Stock queue ----------------
def _needs(order: Order) -> Counter[int]:
    return Counter({i.product_id: i.quantity for i in order.items})


def reserved_units(db: Session, product_ids) -> dict[int, int]:
    """Units already promised to APPROVED (not yet shipped) orders. They are still on the shelf but not free."""
    stmt = (
        select(OrderItem.product_id, func.sum(OrderItem.quantity))
        .join(Order, Order.id == OrderItem.order_id)
        .where(Order.status == OrderStatus.APPROVED, OrderItem.product_id.in_(product_ids))
        .group_by(OrderItem.product_id)
    )
    return {pid: int(units) for pid, units in db.execute(stmt)}


def queue_state(
    db: Session, product_ids, *, extra: Counter[int] | None = None, lock: bool = False
) -> tuple[list[Order], dict[int | None, dict[int, int]], dict[int, Product]]:
    """Walks the waiting orders that use these products, oldest first.

    Free stock = on the shelf - reserved by APPROVED orders. An order that fits takes its units; an order that does
    not fit holds what is there, so a newer order cannot overtake it. `extra` is a not yet placed order
    (checkout preview), it stands at the end of the queue.

    Returns (orders that can be approved now, {order id or None for extra: {product id: missing units}}, products).
    """
    product_ids = set(product_ids) | set(extra or ())
    waiting = db.scalars(
        select(Order)
        .where(Order.status == OrderStatus.PENDING,
               Order.id.in_(select(OrderItem.order_id).where(OrderItem.product_id.in_(product_ids))))
        .options(selectinload(Order.items))
        .order_by(Order.created_at, Order.id)
    ).all()
    all_ids = product_ids | {i.product_id for o in waiting for i in o.items}
    stmt = select(Product).where(Product.id.in_(all_ids)).order_by(Product.id)
    if lock:  # in id order, like ship_order, so two requests never deadlock
        stmt = stmt.with_for_update()
    products = {p.id: p for p in db.scalars(stmt).all()}
    reserved = reserved_units(db, all_ids)
    free = {pid: p.quantity - reserved.get(pid, 0) for pid, p in products.items()}

    ready: list[Order] = []
    missing: dict[int | None, dict[int, int]] = {}
    queue = [(o.id, o, _needs(o)) for o in waiting] + ([(None, None, extra)] if extra else [])
    for key, order, needs in queue:
        short = {pid: n - max(free[pid], 0) for pid, n in needs.items() if n > free[pid]}
        if short:
            missing[key] = short
            for pid, n in needs.items():
                free[pid] -= min(n, max(free[pid], 0))
        else:
            for pid, n in needs.items():
                free[pid] -= n
            if order is not None:
                ready.append(order)
    return ready, missing, products


def _approve(db: Session, order: Order, manager: Employee | None, at: datetime | None) -> None:
    order.status = OrderStatus.APPROVED
    order.approved_by_id = manager.id if manager else None
    order.approved_at = at or utcnow()
    assignment_service.assign(db, order, order.approved_at)


def approve_waiting(db: Session, product_ids, at: datetime | None = None) -> list[Order]:
    """Approves every waiting order that now fits (after a delivery, a cancellation or a new order)."""
    ready, _, _ = queue_state(db, product_ids, lock=True)
    for order in ready:
        _approve(db, order, None, at)
    return ready


def check_stock(db: Session, order: Order) -> None:
    """Rule 4 for a manual approve: every line must fit into the free stock (shelf - already approved orders)."""
    reserved = reserved_units(db, [i.product_id for i in order.items])
    shortages = []
    for item in order.items:
        product = db.get(Product, item.product_id)
        free = product.quantity - reserved.get(product.id, 0)
        if item.quantity > free:
            shortages.append(f"{product.code} {product.product_name} ({max(free, 0)} free, {item.quantity} ordered)")
    if shortages:
        raise HTTPException(status.HTTP_409_CONFLICT, "Not enough stock: " + "; ".join(shortages))


# ---------------- Workflow ----------------
def create_order(db: Session, customer: Customer, data: OrderCreate, at: datetime | None = None) -> Order:
    # The same product twice in the cart becomes one line (UNIQUE(order, product)).
    wanted: Counter[int] = Counter()
    for item in data.items:
        wanted[item.product_id] += item.quantity

    products = {
        p.id: p for p in db.scalars(select(Product).where(Product.id.in_(wanted.keys()))).all()
    }
    for product_id in wanted:
        product = products.get(product_id)
        if product is None or not product.is_active:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, f"Product {product_id} is not available")

    address = data.delivery_address or customer.address
    if not address:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Delivery address is required")

    order = Order(
        customer_id=customer.id,
        status=OrderStatus.PENDING,
        delivery_address=address,
        comment=data.comment,
        created_at=at or utcnow(),
    )
    for product_id, qty in wanted.items():
        # Price is frozen now; later price changes do not touch this order (rule 6).
        order.items.append(OrderItem(product_id=product_id, quantity=qty, unit_price=products[product_id].unit_price))
    # Total is calculated on the server (rule 7).
    order.total_amount = sum((i.unit_price * i.quantity for i in order.items), Decimal("0"))
    db.add(order)
    db.flush()
    # Paid from the customer's account at once; not enough money -> the whole order is rolled back.
    account_service.pay_order(db, order, at)
    # Stock is there and nobody waits before it -> approved and given to a Worker right now.
    approve_waiting(db, wanted.keys(), order.created_at)
    return order


def approve_order(db: Session, order: Order, manager: Employee, at: datetime | None = None) -> Order:
    """Manual approve by a Manager (rarely needed now): may move an order ahead of the queue if stock is free."""
    _require_status(order, OrderStatus.PENDING)
    check_stock(db, order)
    _approve(db, order, manager, at)
    return order


def reject_order(db: Session, order: Order, manager: Employee, reason: str | None, at: datetime | None = None) -> Order:
    """A Manager refuses an order that is not shipped yet (e.g. address outside the area). The money is refunded."""
    _require_status(order, OrderStatus.PENDING, OrderStatus.APPROVED)
    order.status = OrderStatus.REJECTED
    order.approved_by_id = manager.id
    order.approved_at = at or utcnow()
    order.rejection_reason = reason
    account_service.refund_order(db, order, order.approved_at)
    # The units this order held go to the next one in the queue.
    approve_waiting(db, _needs(order).keys(), order.approved_at)
    return order


def ship_order(db: Session, order: Order, worker: Employee, at: datetime | None = None) -> Order:
    """Rule 5: one OUT per line + status SHIPPED. If any line fails, the caller's session is rolled back entirely.

    Any Worker may ship any approved order (e.g. a colleague is ill); the order then becomes his.
    """
    _require_status(order, OrderStatus.APPROVED)
    when = at or utcnow()
    # Lock products in id order so two shipments never deadlock each other.
    for item in sorted(order.items, key=lambda i: i.product_id):
        record_movement(
            db,
            product_id=item.product_id,
            movement_type=MovementType.OUT,
            quantity=item.quantity,
            employee_id=worker.id,
            customer_id=order.customer_id,
            order_id=order.id,
            note=f"Order {order.code}",
            at=when,
        )
    order.status = OrderStatus.SHIPPED
    order.shipped_by_id = worker.id
    order.shipped_at = when
    if order.assigned_to_id != worker.id:
        order.assigned_to_id, order.assigned_at = worker.id, when
    return order


def cancel_order(db: Session, order: Order, *, by_customer: bool, at: datetime | None = None) -> Order:
    """Customer, Manager and Admin can cancel until the order is shipped. The money goes back to the account."""
    _require_status(order, OrderStatus.PENDING, OrderStatus.APPROVED)
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = at or utcnow()
    account_service.refund_order(db, order, order.cancelled_at)
    approve_waiting(db, _needs(order).keys(), order.cancelled_at)
    return order


def order_query():
    return select(Order).options(
        selectinload(Order.items).selectinload(OrderItem.product),
        selectinload(Order.customer),
        selectinload(Order.approved_by),
        selectinload(Order.shipped_by),
        selectinload(Order.assigned_to),
        selectinload(Order.transactions),
    )
