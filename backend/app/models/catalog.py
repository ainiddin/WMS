from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.common import code_column


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("K", 3)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")

    products: Mapped[list["Product"]] = relationship(back_populates="category")


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("S", 3)
    supplier_name: Mapped[str] = mapped_column(String(100), unique=True)
    phone: Mapped[str] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(254))
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")

    products: Mapped[list["Product"]] = relationship(back_populates="supplier")


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="chk_products_quantity"),
        CheckConstraint("min_quantity >= 0", name="chk_products_min_quantity"),
        CheckConstraint("unit_price >= 0", name="chk_products_unit_price"),
        CheckConstraint("length(trim(product_name)) > 0", name="chk_products_name_not_blank"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = code_column("P", 3)
    product_name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"), index=True)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id", ondelete="RESTRICT"), index=True)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    # Only the movement service changes quantity (see services/movement_service.py).
    quantity: Mapped[int] = mapped_column(default=0, server_default="0")
    min_quantity: Mapped[int] = mapped_column(default=0, server_default="0")
    barcode: Mapped[str | None] = mapped_column(String(32), unique=True)
    # Set by the system, never typed by a person (lesson from Task 7).
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default="true")

    category: Mapped[Category] = relationship(back_populates="products")
    supplier: Mapped[Supplier] = relationship(back_populates="products")

    @property
    def in_stock(self) -> bool:
        return self.quantity > 0

    @property
    def below_min(self) -> bool:
        return self.quantity < self.min_quantity
