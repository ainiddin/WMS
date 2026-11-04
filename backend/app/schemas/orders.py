from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints

from app.schemas.common import Money, ORMModel


# ---- Movements ----
class StockInRequest(BaseModel):
    """Give product_id, or barcode (from the scanner). Exactly one of them."""

    product_id: int | None = None
    barcode: str | None = None
    quantity: int = Field(gt=0, le=100_000)
    note: Annotated[str, StringConstraints(max_length=255)] | None = None


class MovementOut(ORMModel):
    id: int
    code: str
    movement_type: str
    quantity: int
    movement_time: datetime
    note: str | None
    product_id: int
    product_code: str
    product_name: str
    employee_id: int
    employee_name: str
    customer_id: int | None
    customer_name: str | None
    order_id: int | None
    order_code: str | None

    @classmethod
    def from_movement(cls, m) -> "MovementOut":
        return cls(
            id=m.id,
            code=m.code,
            movement_type=m.movement_type,
            quantity=m.quantity,
            movement_time=m.movement_time,
            note=m.note,
            product_id=m.product_id,
            product_code=m.product.code,
            product_name=m.product.product_name,
            employee_id=m.employee_id,
            employee_name=m.employee.full_name,
            customer_id=m.customer_id,
            customer_name=m.customer.full_name if m.customer else None,
            order_id=m.order_id,
            order_code=m.order.code if m.order else None,
        )


# ---- Orders ----
class OrderItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=1000)


class OrderCreate(BaseModel):
    items: list[OrderItemIn] = Field(min_length=1, max_length=100)
    # If empty, the customer's saved address is used.
    delivery_address: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None
    comment: Annotated[str, StringConstraints(max_length=1000)] | None = None


class RejectRequest(BaseModel):
    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)] | None = None


class OrderItemOut(BaseModel):
    id: int
    product_id: int
    product_code: str
    product_name: str
    barcode: str | None
    quantity: int
    unit_price: Money
    line_total: Money
    # Filled only for staff: helps the manager see shortages before approving.
    available_quantity: int | None = None


class PersonShort(BaseModel):
    id: int
    code: str
    full_name: str


class OrderOut(BaseModel):
    id: int
    code: str
    status: str
    delivery_address: str
    total_amount: Money
    comment: str | None
    rejection_reason: str | None
    created_at: datetime
    approved_at: datetime | None
    shipped_at: datetime | None
    cancelled_at: datetime | None
    customer: PersonShort
    approved_by: PersonShort | None
    shipped_by: PersonShort | None
    items: list[OrderItemOut]

    @classmethod
    def from_order(cls, order, staff_view: bool) -> "OrderOut":
        def person(p):
            return PersonShort(id=p.id, code=p.code, full_name=p.full_name) if p else None

        return cls(
            id=order.id,
            code=order.code,
            status=order.status,
            delivery_address=order.delivery_address,
            total_amount=order.total_amount,
            comment=order.comment,
            rejection_reason=order.rejection_reason,
            created_at=order.created_at,
            approved_at=order.approved_at,
            shipped_at=order.shipped_at,
            cancelled_at=order.cancelled_at,
            customer=person(order.customer),
            approved_by=person(order.approved_by),
            shipped_by=person(order.shipped_by),
            items=[
                OrderItemOut(
                    id=i.id,
                    product_id=i.product_id,
                    product_code=i.product.code,
                    product_name=i.product.product_name,
                    barcode=i.product.barcode if staff_view else None,
                    quantity=i.quantity,
                    unit_price=i.unit_price,
                    line_total=i.line_total,
                    available_quantity=i.product.quantity if staff_view else None,
                )
                for i in order.items
            ],
        )
