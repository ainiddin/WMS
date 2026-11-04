"""Reports = the queries from sql/03_queries.sql, written with SQLAlchemy. Each returns a list of plain dicts,
so the same rows go to JSON, Excel and PDF."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Customer, MovementType, Order, OrderStatus, Product, StockMovement, Supplier
from app.services.order_service import order_query
from app.services.timeutil import local_tz

# (key, column title) for each report, used by the export.
COLUMNS = {
    "restock": [
        ("product_code", "Product"), ("product_name", "Name"), ("quantity", "Qty"), ("min_quantity", "Min"),
        ("shortage", "To order"), ("supplier_code", "Supplier"), ("supplier_name", "Supplier name"),
        ("supplier_phone", "Phone"),
    ],
    "monthly-usage": [
        ("month", "Month"), ("product_code", "Product"), ("product_name", "Name"),
        ("units_out", "Units out"), ("movements", "Movements"),
    ],
    "top-customers": [
        ("customer_code", "Customer"), ("full_name", "Name"), ("orders_shipped", "Orders"),
        ("units", "Units"), ("total_amount", "Total, KZT"),
    ],
    "reconciliation": [
        ("product_code", "Product"), ("product_name", "Name"), ("quantity", "Qty in table"),
        ("total_in", "Sum IN"), ("total_out", "Sum OUT"), ("expected", "IN - OUT"),
        ("difference", "Difference"), ("ok", "OK"),
    ],
    "orders": [
        ("code", "Order"), ("created_at", "Created"), ("customer", "Customer"), ("status", "Status"),
        ("items", "Lines"), ("total_amount", "Total, KZT"), ("approved_by", "Approved by"),
        ("shipped_by", "Shipped by"), ("shipped_at", "Shipped"),
    ],
}

TITLES = {
    "restock": "Restock list (products below minimum)",
    "monthly-usage": "Monthly usage (OUT by month)",
    "top-customers": "Top customers (shipped orders)",
    "reconciliation": "Stock reconciliation: quantity vs SUM(IN) - SUM(OUT)",
    "orders": "Orders",
}


def restock(db: Session) -> list[dict]:
    """Main query of Task 9: what to reorder and whom to call."""
    stmt = (
        select(Product, Supplier)
        .join(Supplier, Product.supplier_id == Supplier.id)
        .where(Product.is_active, Product.quantity < Product.min_quantity)
        .order_by((Product.min_quantity - Product.quantity).desc(), Product.id)
    )
    return [
        {
            "product_id": p.id,
            "product_code": p.code,
            "product_name": p.product_name,
            "quantity": p.quantity,
            "min_quantity": p.min_quantity,
            "shortage": p.min_quantity - p.quantity,
            "supplier_id": s.id,
            "supplier_code": s.code,
            "supplier_name": s.supplier_name,
            "supplier_phone": s.phone,
            "supplier_email": s.email,
        }
        for p, s in db.execute(stmt).all()
    ]


def _local_month(column):
    return func.to_char(func.timezone(str(local_tz()), column), "YYYY-MM")


def monthly_usage(db: Session, months: int = 12, product_id: int | None = None) -> list[dict]:
    since = datetime.now(UTC) - timedelta(days=31 * months)
    month = _local_month(StockMovement.movement_time).label("month")
    stmt = (
        select(
            month,
            Product.id,
            Product.code,
            Product.product_name,
            func.sum(StockMovement.quantity),
            func.count(StockMovement.id),
        )
        .join(Product, StockMovement.product_id == Product.id)
        .where(StockMovement.movement_type == MovementType.OUT, StockMovement.movement_time >= since)
        .group_by(month, Product.id, Product.code, Product.product_name)
        .order_by(month, Product.code)
    )
    if product_id:
        stmt = stmt.where(Product.id == product_id)
    return [
        {"month": m, "product_id": pid, "product_code": code, "product_name": name, "units_out": int(units),
         "movements": cnt}
        for m, pid, code, name, units, cnt in db.execute(stmt).all()
    ]


def top_customers(db: Session, limit: int = 10) -> list[dict]:
    units = (
        select(func.coalesce(func.sum(StockMovement.quantity), 0))
        .where(StockMovement.customer_id == Customer.id, StockMovement.movement_type == MovementType.OUT)
        .correlate(Customer)
        .scalar_subquery()
    )
    stmt = (
        select(
            Customer.id, Customer.code, Customer.full_name,
            func.count(Order.id), units, func.sum(Order.total_amount),
        )
        .join(Order, Order.customer_id == Customer.id)
        .where(Order.status == OrderStatus.SHIPPED)
        .group_by(Customer.id, Customer.code, Customer.full_name)
        .order_by(func.sum(Order.total_amount).desc())
        .limit(limit)
    )
    return [
        {"customer_id": cid, "customer_code": code, "full_name": name, "orders_shipped": n, "units": int(u),
         "total_amount": float(total)}
        for cid, code, name, n, u, total in db.execute(stmt).all()
    ]


def reconciliation(db: Session, only_problems: bool = False) -> list[dict]:
    """If the stock table and the movement history disagree, `difference` is not 0."""
    total_in = func.coalesce(
        func.sum(case((StockMovement.movement_type == MovementType.IN, StockMovement.quantity), else_=0)), 0
    )
    total_out = func.coalesce(
        func.sum(case((StockMovement.movement_type == MovementType.OUT, StockMovement.quantity), else_=0)), 0
    )
    stmt = (
        select(Product.id, Product.code, Product.product_name, Product.quantity, total_in, total_out)
        .outerjoin(StockMovement, StockMovement.product_id == Product.id)
        .group_by(Product.id, Product.code, Product.product_name, Product.quantity)
        .order_by(Product.id)
    )
    rows = []
    for pid, code, name, qty, tin, tout in db.execute(stmt).all():
        expected = int(tin) - int(tout)
        row = {
            "product_id": pid, "product_code": code, "product_name": name, "quantity": qty,
            "total_in": int(tin), "total_out": int(tout), "expected": expected,
            "difference": qty - expected, "ok": qty == expected,
        }
        if not only_problems or not row["ok"]:
            rows.append(row)
    return rows


def orders_report(db: Session, status: str | None = None, days: int | None = None) -> list[dict]:
    stmt = order_query().order_by(Order.created_at.desc())
    if status:
        stmt = stmt.where(Order.status == status)
    if days:
        stmt = stmt.where(Order.created_at >= datetime.now(UTC) - timedelta(days=days))
    tz = local_tz()

    def fmt(dt):
        return dt.astimezone(tz).strftime("%Y-%m-%d %H:%M") if dt else ""

    return [
        {
            "id": o.id, "code": o.code, "created_at": fmt(o.created_at), "customer": o.customer.full_name,
            "status": o.status, "items": len(o.items), "total_amount": float(o.total_amount),
            "approved_by": o.approved_by.full_name if o.approved_by else "",
            "shipped_by": o.shipped_by.full_name if o.shipped_by else "", "shipped_at": fmt(o.shipped_at),
        }
        for o in db.scalars(stmt).all()
    ]
