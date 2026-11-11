from datetime import date, datetime, time, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentEmployee, require_role
from app.models import MovementType, Product, StockMovement, User
from app.models.common import STAFF_ROLES
from app.schemas.orders import MovementOut, StockInRequest
from app.services import order_service
from app.services.movement_service import record_movement
from app.services.timeutil import local_tz

router = APIRouter(prefix="/api/movements", tags=["movements"])

Staff = Annotated[User, Depends(require_role(*STAFF_ROLES))]


@router.post("/in/", response_model=MovementOut, status_code=201)
def stock_in(data: StockInRequest, db: DB, employee: CurrentEmployee):
    """Goods received (IN). Find the product by id or by scanned barcode."""
    if (data.product_id is None) == (data.barcode is None):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Give either product_id or barcode")
    product_id = data.product_id
    if data.barcode is not None:
        product_id = db.scalar(select(Product.id).where(Product.barcode == data.barcode.strip()))
        if product_id is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"No product with barcode {data.barcode}")
    movement = record_movement(
        db,
        product_id=product_id,
        movement_type=MovementType.IN,
        quantity=data.quantity,
        employee_id=employee.id,
        note=data.note,
    )
    # Orders that waited for this product are approved and given to Workers in the same transaction.
    order_service.approve_waiting(db, [product_id], movement.movement_time)
    db.commit()
    return MovementOut.from_movement(movement)


@router.get("/", response_model=list[MovementOut])
def list_movements(
    db: DB,
    _: Staff,
    product: int | None = None,
    type: MovementType | None = None,  # noqa: A002 - matches the API in the plan (?type=IN)
    employee: int | None = None,
    order: int | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    """Movement history, newest first. `from` / `to` are dates (inclusive)."""
    stmt = select(StockMovement).options(
        selectinload(StockMovement.product),
        selectinload(StockMovement.employee),
        selectinload(StockMovement.customer),
        selectinload(StockMovement.order),
    )
    if product:
        stmt = stmt.where(StockMovement.product_id == product)
    if type:
        stmt = stmt.where(StockMovement.movement_type == type)
    if employee:
        stmt = stmt.where(StockMovement.employee_id == employee)
    if order:
        stmt = stmt.where(StockMovement.order_id == order)
    tz = local_tz()
    if date_from:
        stmt = stmt.where(StockMovement.movement_time >= datetime.combine(date_from, time.min, tz))
    if date_to:
        stmt = stmt.where(StockMovement.movement_time < datetime.combine(date_to + timedelta(days=1), time.min, tz))
    stmt = stmt.order_by(StockMovement.movement_time.desc(), StockMovement.id.desc()).limit(limit).offset(offset)
    return [MovementOut.from_movement(m) for m in db.scalars(stmt).all()]
