from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select

from app.core.deps import DB, require_role
from app.models import Category, MovementType, Order, OrderItem, OrderStatus, Product, Role, StockMovement, User
from app.services import export_service, report_service
from app.services.timeutil import local_tz

router = APIRouter(prefix="/api", tags=["reports"])

ManagerOrAdmin = Annotated[User, Depends(require_role(Role.ADMIN, Role.MANAGER))]

ReportName = Literal["restock", "monthly-usage", "top-customers", "reconciliation", "orders"]


@router.get("/reports/restock/")
def restock(db: DB, _: ManagerOrAdmin):
    """Products below min_quantity + supplier phone (main query of Task 9)."""
    return report_service.restock(db)


@router.get("/reports/monthly-usage/")
def monthly_usage(db: DB, _: ManagerOrAdmin, months: Annotated[int, Query(ge=1, le=36)] = 12,
                  product: int | None = None):
    return report_service.monthly_usage(db, months, product)


@router.get("/reports/top-customers/")
def top_customers(db: DB, _: ManagerOrAdmin, limit: Annotated[int, Query(ge=1, le=100)] = 10):
    return report_service.top_customers(db, limit)


@router.get("/reports/reconciliation/")
def reconciliation(db: DB, _: ManagerOrAdmin, only_problems: bool = False):
    """quantity in PRODUCTS vs SUM(IN) - SUM(OUT) from the history. All rows should have ok = true."""
    return report_service.reconciliation(db, only_problems)


@router.get("/reports/orders/")
def orders(db: DB, _: ManagerOrAdmin, order_status: Annotated[OrderStatus | None, Query(alias="status")] = None,
           days: Annotated[int | None, Query(ge=1, le=3650)] = None):
    return report_service.orders_report(db, order_status, days)


@router.get("/reports/{name}/export/")
def export_report(name: ReportName, db: DB, _: ManagerOrAdmin,
                  format: Literal["xlsx", "pdf"] = "xlsx"):  # noqa: A002 - query name from the plan
    rows = {
        "restock": lambda: report_service.restock(db),
        "monthly-usage": lambda: report_service.monthly_usage(db),
        "top-customers": lambda: report_service.top_customers(db),
        "reconciliation": lambda: report_service.reconciliation(db),
        "orders": lambda: report_service.orders_report(db),
    }[name]()
    title, columns = report_service.TITLES[name], report_service.COLUMNS[name]
    stamp = datetime.now(local_tz()).strftime("%Y%m%d")
    if format == "xlsx":
        content = export_service.to_xlsx(title, columns, rows)
        media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        content = export_service.to_pdf(title, columns, rows)
        media = "application/pdf"
    filename = f"{name}_{stamp}.{format}"
    return Response(content, media_type=media, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.get("/products/barcodes/labels.pdf", tags=["products"])
def barcode_labels(db: DB, _: ManagerOrAdmin):
    """Printable barcode labels for all active products that have a barcode."""
    products = db.scalars(
        select(Product).where(Product.is_active, Product.barcode.is_not(None)).order_by(Product.id)
    ).all()
    if not products:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No products with barcodes")
    return Response(export_service.barcode_labels_pdf(products), media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="barcodes.pdf"'})


@router.get("/dashboard/", tags=["dashboard"])
def dashboard(db: DB, _: ManagerOrAdmin):
    """Business dashboard: cards + data for the charts."""
    now = datetime.now(UTC)
    month_start = datetime.now(local_tz()).replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    def count(stmt):
        return db.scalar(stmt) or 0

    shipped_month = select(Order).where(Order.status == OrderStatus.SHIPPED, Order.shipped_at >= month_start)
    cards = {
        "products_active": count(select(func.count(Product.id)).where(Product.is_active)),
        "products_below_min": count(
            select(func.count(Product.id)).where(Product.is_active, Product.quantity < Product.min_quantity)
        ),
        "products_out_of_stock": count(
            select(func.count(Product.id)).where(Product.is_active, Product.quantity == 0)
        ),
        "orders_pending": count(select(func.count(Order.id)).where(Order.status == OrderStatus.PENDING)),
        "orders_to_ship": count(select(func.count(Order.id)).where(Order.status == OrderStatus.APPROVED)),
        "orders_shipped_month": count(select(func.count()).select_from(shipped_month.subquery())),
        "revenue_month": float(count(
            select(func.sum(Order.total_amount))
            .where(Order.status == OrderStatus.SHIPPED, Order.shipped_at >= month_start)
        )),
        "stock_value": float(count(
            select(func.sum(Product.quantity * Product.unit_price)).where(Product.is_active)
        )),
    }

    tz = str(local_tz())
    month = func.to_char(func.timezone(tz, StockMovement.movement_time), "YYYY-MM").label("month")
    since = now - timedelta(days=365)
    by_month: dict[str, dict] = {}
    for m, mtype, units in db.execute(
        select(month, StockMovement.movement_type, func.sum(StockMovement.quantity))
        .where(StockMovement.movement_time >= since)
        .group_by(month, StockMovement.movement_type)
        .order_by(month)
    ).all():
        row = by_month.setdefault(m, {"month": m, "in": 0, "out": 0})
        row["in" if mtype == MovementType.IN else "out"] = int(units)

    sales_month = func.to_char(func.timezone(tz, Order.shipped_at), "YYYY-MM").label("month")
    sales = [
        {"month": m, "orders": n, "revenue": float(total)}
        for m, n, total in db.execute(
            select(sales_month, func.count(Order.id), func.sum(Order.total_amount))
            .where(Order.status == OrderStatus.SHIPPED, Order.shipped_at >= since)
            .group_by(sales_month).order_by(sales_month)
        ).all()
    ]

    by_category = [
        {"category": name, "revenue": float(total or 0), "units": int(units or 0)}
        for name, total, units in db.execute(
            select(Category.name, func.sum(OrderItem.quantity * OrderItem.unit_price), func.sum(OrderItem.quantity))
            .join(Product, Product.category_id == Category.id)
            .join(OrderItem, OrderItem.product_id == Product.id)
            .join(Order, Order.id == OrderItem.order_id)
            .where(Order.status == OrderStatus.SHIPPED, Order.shipped_at >= since)
            .group_by(Category.name)
            .order_by(func.sum(OrderItem.quantity * OrderItem.unit_price).desc())
        ).all()
    ]

    stock = [
        {"product_code": code, "product_name": name, "quantity": qty, "min_quantity": mn}
        for code, name, qty, mn in db.execute(
            select(Product.code, Product.product_name, Product.quantity, Product.min_quantity)
            .where(Product.is_active).order_by(Product.id)
        ).all()
    ]

    return {
        "cards": cards,
        "movements_by_month": list(by_month.values()),
        "sales_by_month": sales,
        "sales_by_category": by_category,
        "top_customers": report_service.top_customers(db, 5),
        "stock_by_product": stock,
        "restock": report_service.restock(db)[:10],
    }
