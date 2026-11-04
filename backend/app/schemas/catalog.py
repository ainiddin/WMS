from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, EmailStr, Field, StringConstraints

from app.schemas.common import Money, Name, ORMModel, Phone, PriceIn

Barcode = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^[0-9A-Za-z\-]{4,32}$")]


# ---- Categories ----
class CategoryIn(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    is_active: bool = True


class CategoryUpdate(BaseModel):
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)] | None = None
    is_active: bool | None = None


class CategoryOut(ORMModel):
    id: int
    code: str
    name: str
    is_active: bool


# ---- Suppliers ----
class SupplierIn(BaseModel):
    supplier_name: Name
    phone: Phone
    email: EmailStr | None = None
    is_active: bool = True


class SupplierUpdate(BaseModel):
    supplier_name: Name | None = None
    phone: Phone | None = None
    email: EmailStr | None = None
    is_active: bool | None = None


class SupplierOut(ORMModel):
    id: int
    code: str
    supplier_name: str
    phone: str
    email: str | None
    is_active: bool


class SupplierShort(ORMModel):
    id: int
    code: str
    supplier_name: str
    # Hidden (None) for Workers: they do not see supplier contacts.
    phone: str | None


# ---- Products ----
class ProductIn(BaseModel):
    product_name: Name
    description: str | None = None
    category_id: int
    supplier_id: int
    unit_price: PriceIn
    min_quantity: int = Field(default=0, ge=0)
    barcode: Barcode | None = None
    is_active: bool = True
    # No `quantity` here on purpose: stock changes only through movements (IN/OUT).


class ProductUpdate(BaseModel):
    product_name: Name | None = None
    description: str | None = None
    category_id: int | None = None
    supplier_id: int | None = None
    unit_price: PriceIn | None = None
    min_quantity: int | None = Field(default=None, ge=0)
    barcode: Barcode | None = None
    is_active: bool | None = None


class ProductPublicOut(ORMModel):
    """What a customer (or anonymous visitor) sees: no exact stock, no supplier."""

    id: int
    code: str
    product_name: str
    description: str | None
    category: CategoryOut
    unit_price: Money
    in_stock: bool
    is_active: bool


class ProductStaffOut(ProductPublicOut):
    quantity: int
    min_quantity: int
    below_min: bool
    barcode: str | None
    last_updated: datetime
    supplier: SupplierShort
