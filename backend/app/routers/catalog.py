"""Categories, suppliers and products.

Deleting a row that has history (products in orders/movements, suppliers with products...) is refused by the
database (ON DELETE RESTRICT) and returned as 409; set is_active = false instead (rule 3).
"""

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, OptionalUser, require_role
from app.models import Category, MovementType, Product, Role, StockMovement, Supplier, User
from app.models.common import STAFF_ROLES
from app.schemas.catalog import (
    CategoryIn,
    CategoryOut,
    CategoryUpdate,
    ProductIn,
    ProductPublicOut,
    ProductStaffOut,
    ProductUpdate,
    SupplierIn,
    SupplierOut,
    SupplierUpdate,
)

router = APIRouter(prefix="/api", tags=["catalog"])

ManagerOrAdmin = Annotated[User, Depends(require_role(Role.ADMIN, Role.MANAGER))]


def _get_or_404(db, model, obj_id: int):
    obj = db.get(model, obj_id)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{model.__name__} not found")
    return obj


def _apply(obj, data) -> None:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(obj, field, value)


# ---------------- Categories ----------------
@router.get("/categories/", response_model=list[CategoryOut], tags=["categories"])
def list_categories(db: DB, user: OptionalUser, include_inactive: bool = False):
    stmt = select(Category).order_by(Category.name)
    is_editor = user is not None and user.role in (Role.ADMIN, Role.MANAGER)
    if not (include_inactive and is_editor):
        stmt = stmt.where(Category.is_active)
    return db.scalars(stmt).all()


@router.post("/categories/", response_model=CategoryOut, status_code=201, tags=["categories"])
def create_category(data: CategoryIn, db: DB, _: ManagerOrAdmin):
    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    return category


@router.patch("/categories/{category_id}/", response_model=CategoryOut, tags=["categories"])
def update_category(category_id: int, data: CategoryUpdate, db: DB, _: ManagerOrAdmin):
    category = _get_or_404(db, Category, category_id)
    _apply(category, data)
    db.commit()
    return category


@router.delete("/categories/{category_id}/", status_code=204, tags=["categories"])
def delete_category(category_id: int, db: DB, _: ManagerOrAdmin):
    db.delete(_get_or_404(db, Category, category_id))
    db.commit()
    return Response(status_code=204)


# ---------------- Suppliers ----------------
@router.get("/suppliers/", response_model=list[SupplierOut], tags=["suppliers"])
def list_suppliers(db: DB, _: ManagerOrAdmin, include_inactive: bool = False, search: str | None = None):
    stmt = select(Supplier).order_by(Supplier.id)
    if not include_inactive:
        stmt = stmt.where(Supplier.is_active)
    if search:
        stmt = stmt.where(Supplier.supplier_name.ilike(f"%{search.strip()}%"))
    return db.scalars(stmt).all()


@router.get("/suppliers/{supplier_id}/", response_model=SupplierOut, tags=["suppliers"])
def get_supplier(supplier_id: int, db: DB, _: ManagerOrAdmin):
    return _get_or_404(db, Supplier, supplier_id)


@router.post("/suppliers/", response_model=SupplierOut, status_code=201, tags=["suppliers"])
def create_supplier(data: SupplierIn, db: DB, _: ManagerOrAdmin):
    supplier = Supplier(**data.model_dump())
    db.add(supplier)
    db.commit()
    return supplier


@router.patch("/suppliers/{supplier_id}/", response_model=SupplierOut, tags=["suppliers"])
def update_supplier(supplier_id: int, data: SupplierUpdate, db: DB, _: ManagerOrAdmin):
    supplier = _get_or_404(db, Supplier, supplier_id)
    _apply(supplier, data)
    db.commit()
    return supplier


@router.delete("/suppliers/{supplier_id}/", status_code=204, tags=["suppliers"])
def delete_supplier(supplier_id: int, db: DB, _: ManagerOrAdmin):
    db.delete(_get_or_404(db, Supplier, supplier_id))
    db.commit()
    return Response(status_code=204)


# ---------------- Products ----------------
def _is_staff(user: User | None) -> bool:
    return user is not None and user.role in STAFF_ROLES


def _product_out(product: Product, user: User | None):
    if not _is_staff(user):
        return ProductPublicOut.model_validate(product)
    out = ProductStaffOut.model_validate(product)
    if user.role == Role.WORKER:
        out.supplier.phone = None
    return out


def _check_refs(db, category_id: int | None, supplier_id: int | None) -> None:
    if category_id is not None:
        _get_or_404(db, Category, category_id)
    if supplier_id is not None:
        _get_or_404(db, Supplier, supplier_id)


@router.get("/products/", response_model=list[ProductStaffOut] | list[ProductPublicOut], tags=["products"])
def list_products(
    db: DB,
    user: OptionalUser,
    search: str | None = None,
    category_id: int | None = None,
    supplier_id: int | None = None,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    in_stock: bool | None = None,
    below_min: bool | None = None,
    include_inactive: bool = False,
    sort: str = "name",
):
    """Everyone can read. Staff get stock, supplier and barcode; customers/visitors only "in stock: yes/no"."""
    staff = _is_staff(user)
    stmt = select(Product).options(selectinload(Product.category), selectinload(Product.supplier))
    if not (include_inactive and staff):
        stmt = stmt.where(Product.is_active)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(Product.product_name.ilike(like) | Product.code.ilike(like) | Product.barcode.ilike(like))
    if category_id:
        stmt = stmt.where(Product.category_id == category_id)
    if supplier_id and staff:
        stmt = stmt.where(Product.supplier_id == supplier_id)
    if min_price is not None:
        stmt = stmt.where(Product.unit_price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.unit_price <= max_price)
    if in_stock is not None:
        stmt = stmt.where(Product.quantity > 0 if in_stock else Product.quantity == 0)
    if below_min is not None and staff:
        stmt = stmt.where(Product.quantity < Product.min_quantity if below_min else Product.quantity >= Product.min_quantity)
    order_by = {
        "name": Product.product_name,
        "price": Product.unit_price,
        "-price": Product.unit_price.desc(),
        "code": Product.id,
        "quantity": Product.quantity,
    }.get(sort, Product.product_name)
    stmt = stmt.order_by(order_by)
    return [_product_out(p, user) for p in db.scalars(stmt).all()]


@router.get("/products/popular/", response_model=list[ProductPublicOut], tags=["products"])
def popular_products(db: DB, limit: Annotated[int, Query(ge=1, le=50)] = 8, days: Annotated[int, Query(ge=1)] = 90):
    """Best sellers (units shipped in the last `days` days) for the shop home page."""
    since = datetime.now(UTC) - timedelta(days=days)
    sold = (
        select(StockMovement.product_id, func.sum(StockMovement.quantity).label("units"))
        .where(StockMovement.movement_type == MovementType.OUT, StockMovement.movement_time >= since)
        .group_by(StockMovement.product_id)
        .subquery()
    )
    stmt = (
        select(Product)
        .options(selectinload(Product.category))
        .outerjoin(sold, sold.c.product_id == Product.id)
        .where(Product.is_active, Product.quantity > 0)
        .order_by(func.coalesce(sold.c.units, 0).desc(), Product.id)
        .limit(limit)
    )
    return [ProductPublicOut.model_validate(p) for p in db.scalars(stmt).all()]


@router.get("/products/by-barcode/{barcode}/", response_model=ProductStaffOut, tags=["products"])
def product_by_barcode(barcode: str, db: DB, user: Annotated[User, Depends(require_role(*STAFF_ROLES))]):
    """For the scanner in Stock IN and Ship forms."""
    product = db.scalars(select(Product).where(Product.barcode == barcode.strip())).one_or_none()
    if product is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No product with barcode {barcode}")
    return _product_out(product, user)


@router.get("/products/{product_id}/", response_model=ProductStaffOut | ProductPublicOut, tags=["products"])
def get_product(product_id: int, db: DB, user: OptionalUser):
    product = _get_or_404(db, Product, product_id)
    if not product.is_active and not _is_staff(user):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return _product_out(product, user)


@router.post("/products/", response_model=ProductStaffOut, status_code=201, tags=["products"])
def create_product(data: ProductIn, db: DB, _: ManagerOrAdmin):
    _check_refs(db, data.category_id, data.supplier_id)
    product = Product(**data.model_dump(), quantity=0)
    db.add(product)
    db.commit()
    return product


@router.patch("/products/{product_id}/", response_model=ProductStaffOut, tags=["products"])
def update_product(product_id: int, data: ProductUpdate, db: DB, _: ManagerOrAdmin):
    product = _get_or_404(db, Product, product_id)
    _check_refs(db, data.category_id, data.supplier_id)
    _apply(product, data)
    db.commit()
    return product


@router.delete("/products/{product_id}/", status_code=204, tags=["products"])
def delete_product(product_id: int, db: DB, _: ManagerOrAdmin):
    """Works only for a product without history; otherwise 409 — deactivate it with PATCH is_active=false."""
    db.delete(_get_or_404(db, Product, product_id))
    db.commit()
    return Response(status_code=204)
