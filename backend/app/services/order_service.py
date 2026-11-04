"""Order workflow: PENDING -> APPROVED -> SHIPPED, with REJECTED / CANCELLED exits.

Functions change the session but do not commit; the router commits once.
"""

from collections import Counter
from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Customer, Employee, MovementType, Order, OrderItem, OrderStatus, Product
from app.models.common import utcnow
from app.schemas.orders import OrderCreate
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
    return order


def check_stock(db: Session, order: Order) -> None:
    """Rule 4: every line must fit into the current stock."""
    shortages = []
    for item in order.items:
        product = db.get(Product, item.product_id)
        if item.quantity > product.quantity:
            shortages.append(f"{product.code} {product.product_name} ({product.quantity} available, {item.quantity} ordered)")
    if shortages:
        raise HTTPException(status.HTTP_409_CONFLICT, "Not enough stock: " + "; ".join(shortages))


def approve_order(db: Session, order: Order, manager: Employee, at: datetime | None = None) -> Order:
    _require_status(order, OrderStatus.PENDING)
    check_stock(db, order)
    order.status = OrderStatus.APPROVED
    order.approved_by_id = manager.id
    order.approved_at = at or utcnow()
    return order


def reject_order(db: Session, order: Order, manager: Employee, reason: str | None, at: datetime | None = None) -> Order:
    _require_status(order, OrderStatus.PENDING)
    order.status = OrderStatus.REJECTED
    order.approved_by_id = manager.id
    order.approved_at = at or utcnow()
    order.rejection_reason = reason
    return order


def ship_order(db: Session, order: Order, worker: Employee, at: datetime | None = None) -> Order:
    """Rule 5: one OUT per line + status SHIPPED. If any line fails, the caller's session is rolled back entirely."""
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
    return order


def cancel_order(db: Session, order: Order, *, by_customer: bool, at: datetime | None = None) -> Order:
    if by_customer:
        _require_status(order, OrderStatus.PENDING)
    else:
        _require_status(order, OrderStatus.PENDING, OrderStatus.APPROVED)
    order.status = OrderStatus.CANCELLED
    order.cancelled_at = at or utcnow()
    return order


def order_query():
    return select(Order).options(
        selectinload(Order.items).selectinload(OrderItem.product),
        selectinload(Order.customer),
        selectinload(Order.approved_by),
        selectinload(Order.shipped_by),
    )
