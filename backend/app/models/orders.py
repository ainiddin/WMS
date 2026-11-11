from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.catalog import Product
from app.models.common import MovementType, OrderStatus, code_column, created_at_column, in_check
from app.models.people import Customer, Employee


class Order(Base):
    __tablename__ = "orders"
    __table_args__ = (
        CheckConstraint(in_check("status", OrderStatus), name="chk_orders_status"),
        CheckConstraint("total_amount >= 0", name="chk_orders_total"),
        CheckConstraint("status <> 'SHIPPED' OR (shipped_by_id IS NOT NULL AND shipped_at IS NOT NULL)",
                        name="chk_orders_shipped_fields"),
        # approved_by is NULL when the system approved the order by itself (stock was there).
        CheckConstraint("status NOT IN ('APPROVED', 'SHIPPED') OR approved_at IS NOT NULL",
                        name="chk_orders_approved_fields"),
        Index("ix_orders_status", "status"),
        Index("ix_orders_approved_at", "approved_at"),
        Index("ix_orders_shipped_at", "shipped_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("O", 4)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(10), default=OrderStatus.PENDING)
    delivery_address: Mapped[str] = mapped_column(String(255))
    # Computed by the server from the items, never sent by the browser (rule 7).
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), default=Decimal("0"))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_at_column()
    # approved_by is set on a manual approve AND on reject: it is "the manager who decided".
    # NULL with approved_at set = approved automatically by the system.
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejection_reason: Mapped[str | None] = mapped_column(String(255))
    # The Worker who should pick and ship it: the least loaded one at approval time (assignment_service).
    assigned_to_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"), index=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    shipped_by_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"))
    shipped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    customer: Mapped[Customer] = relationship()
    approved_by: Mapped[Employee | None] = relationship(foreign_keys=[approved_by_id])
    shipped_by: Mapped[Employee | None] = relationship(foreign_keys=[shipped_by_id])
    assigned_to: Mapped[Employee | None] = relationship(foreign_keys=[assigned_to_id])
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id"
    )
    transactions: Mapped[list["AccountTransaction"]] = relationship(back_populates="order")  # noqa: F821

    @property
    def payment_status(self) -> str | None:
        """PAID / REFUNDED for orders paid from the account; None for old orders paid on delivery."""
        types = {t.tx_type for t in self.transactions}
        return "REFUNDED" if "REFUND" in types else "PAID" if "PAYMENT" in types else None


class OrderItem(Base):
    """Bridge table ORDERS <-> PRODUCTS (M:N). unit_price is frozen at order time (rule 6)."""

    __tablename__ = "order_items"
    __table_args__ = (
        UniqueConstraint("order_id", "product_id", name="uq_order_items_order_product"),
        CheckConstraint("quantity > 0", name="chk_order_items_quantity"),
        CheckConstraint("unit_price >= 0", name="chk_order_items_unit_price"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    quantity: Mapped[int]
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))

    order: Mapped[Order] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()

    @property
    def line_total(self) -> Decimal:
        return self.unit_price * self.quantity


class StockMovement(Base):
    """Event table from Task 9: every change of stock is one row here."""

    __tablename__ = "stock_movements"
    __table_args__ = (
        CheckConstraint(in_check("movement_type", MovementType), name="chk_movement_type"),
        CheckConstraint("quantity > 0", name="chk_movement_quantity"),
        # OUT always goes to a customer, IN never has one.
        CheckConstraint(
            "(movement_type = 'OUT' AND customer_id IS NOT NULL) OR (movement_type = 'IN' AND customer_id IS NULL)",
            name="chk_customer_for_out",
        ),
        CheckConstraint("order_id IS NULL OR movement_type = 'OUT'", name="chk_order_only_for_out"),
        Index("ix_movements_time", "movement_time"),
        Index("ix_movements_employee_type_time", "employee_id", "movement_type", "movement_time"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("M", 4)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id", ondelete="RESTRICT"), index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="RESTRICT"))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id", ondelete="RESTRICT"), index=True)
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id", ondelete="RESTRICT"), index=True)
    movement_type: Mapped[str] = mapped_column(String(3))
    quantity: Mapped[int]
    movement_time: Mapped[datetime] = created_at_column()
    note: Mapped[str | None] = mapped_column(String(255))

    product: Mapped[Product] = relationship()
    employee: Mapped[Employee] = relationship()
    customer: Mapped[Customer | None] = relationship()
    order: Mapped[Order | None] = relationship()
