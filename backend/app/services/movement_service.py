"""Python version of record_movement() from sql/04_transaction.sql.

Every stock change goes through record_movement(). It does NOT commit: the caller commits once, so several
movements (e.g. all items of an order) are saved together or not at all.
"""

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MovementType, Product, StockMovement
from app.models.common import utcnow


def lock_product(db: Session, product_id: int) -> Product:
    """SELECT ... FOR UPDATE: two workers changing the same product wait for each other instead of losing an update."""
    product = db.scalars(select(Product).where(Product.id == product_id).with_for_update()).one_or_none()
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Product {product_id} not found")
    return product


def record_movement(
    db: Session,
    *,
    product_id: int,
    movement_type: MovementType,
    quantity: int,
    employee_id: int,
    customer_id: int | None = None,
    order_id: int | None = None,
    note: str | None = None,
    at: datetime | None = None,
) -> StockMovement:
    if quantity <= 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Quantity must be greater than 0")
    if movement_type == MovementType.OUT and customer_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "OUT movement needs a customer")
    if movement_type == MovementType.IN and customer_id is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "IN movement cannot have a customer")

    product = lock_product(db, product_id)
    if not product.is_active:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Product {product.code} is inactive")

    if movement_type == MovementType.IN:
        product.quantity += quantity
    else:
        if product.quantity < quantity:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                f"Not enough stock for {product.code} {product.product_name}: "
                f"{product.quantity} available, {quantity} requested",
            )
        product.quantity -= quantity
    when = at or utcnow()
    product.last_updated = when

    movement = StockMovement(
        product_id=product.id,
        movement_type=movement_type,
        quantity=quantity,
        employee_id=employee_id,
        customer_id=customer_id,
        order_id=order_id,
        note=note,
        movement_time=when,
    )
    db.add(movement)
    db.flush()
    return movement
