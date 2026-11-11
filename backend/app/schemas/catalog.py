from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, EmailStr, Field, StringConstraints

from app.schemas.common import Money, Name, ORMModel, Phone, PriceIn


def ean13_check_digit(body12: str) -> str:
    """Last digit of an EAN-13: digits at odd positions x1, at even positions x3, rounded up to a multiple of 10."""
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(body12))
    return str((10 - total % 10) % 10)


def check_ean13(value: str) -> str:
    """A barcode must be a real EAN-13: 13 digits and a correct check digit (catches a mistyped digit)."""
    if len(value) != 13 or not value.isdigit():
        raise ValueError("Barcode must be EAN-13: exactly 13 digits")
    if value[-1] != ean13_check_digit(value[:12]):
        raise ValueError(f"Wrong EAN-13 check digit: for {value[:12]} the last digit must be {ean13_check_digit(value[:12])}")
    return value


Barcode = Annotated[str, StringConstraints(strip_whitespace=True), AfterValidator(check_ean13)]


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
