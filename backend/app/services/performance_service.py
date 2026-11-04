"""Performance dashboard and team leaderboard.

Nothing is typed in by hand: every number comes from ORDERS (approved_by / shipped_by) and STOCK_MOVEMENTS.
Each metric is one SQL query with GROUP BY employee.

Points = orders shipped x 10 + orders approved x 2 + stock IN movements x 1.
Only orders that are still APPROVED or SHIPPED count as "approved" (a cancelled order gives no points).
"""

from dataclasses import asdict, dataclass, field
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Employee, MovementType, Order, OrderStatus, Role, StockMovement
from app.services.timeutil import PERIOD_BUCKET, bucket_series, local_tz, period_range

POINTS_SHIPPED = 10
POINTS_APPROVED = 2
POINTS_STOCK_IN = 1

COUNTED_APPROVED = (OrderStatus.APPROVED, OrderStatus.SHIPPED)


@dataclass
class Metrics:
    employee_id: int
    code: str
    full_name: str
    role: str
    manager_id: int | None
    is_active: bool
    orders_approved: int = 0
    orders_rejected: int = 0
    avg_approval_hours: float | None = None
    orders_shipped: int = 0
    units_shipped: int = 0
    stock_in_count: int = 0
    units_in: int = 0

    @property
    def points(self) -> int:
        return (self.orders_shipped * POINTS_SHIPPED + self.orders_approved * POINTS_APPROVED
                + self.stock_in_count * POINTS_STOCK_IN)

    def to_dict(self) -> dict:
        return asdict(self) | {"points": self.points}


@dataclass
class TeamSummary:
    manager_id: int
    manager_code: str
    manager_name: str
    team_name: str
    members: int
    orders_shipped: int = 0
    orders_approved: int = 0
    stock_in_count: int = 0
    units_shipped: int = 0
    points: int = 0
    rank: int = 0
    member_ids: list[int] = field(default_factory=list, repr=False)

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("member_ids")
        return d


def _in_period(column, start: datetime, end: datetime):
    return (column >= start) & (column <= end)


def compute_metrics(db: Session, employees: list[Employee], start: datetime, end: datetime) -> dict[int, Metrics]:
    ids = [e.id for e in employees]
    result = {
        e.id: Metrics(e.id, e.code, e.full_name, e.role, e.manager_id, e.is_active) for e in employees
    }
    if not ids:
        return result

    approved = db.execute(
        select(
            Order.approved_by_id,
            func.count(Order.id),
            func.avg(func.extract("epoch", Order.approved_at - Order.created_at) / 3600),
        )
        .where(Order.approved_by_id.in_(ids), Order.status.in_(COUNTED_APPROVED),
               _in_period(Order.approved_at, start, end))
        .group_by(Order.approved_by_id)
    ).all()
    for emp_id, count, avg_hours in approved:
        result[emp_id].orders_approved = count
        result[emp_id].avg_approval_hours = round(float(avg_hours), 1) if avg_hours is not None else None

    rejected = db.execute(
        select(Order.approved_by_id, func.count(Order.id))
        .where(Order.approved_by_id.in_(ids), Order.status == OrderStatus.REJECTED,
               _in_period(Order.approved_at, start, end))
        .group_by(Order.approved_by_id)
    ).all()
    for emp_id, count in rejected:
        result[emp_id].orders_rejected = count

    shipped = db.execute(
        select(Order.shipped_by_id, func.count(Order.id))
        .where(Order.shipped_by_id.in_(ids), Order.status == OrderStatus.SHIPPED,
               _in_period(Order.shipped_at, start, end))
        .group_by(Order.shipped_by_id)
    ).all()
    for emp_id, count in shipped:
        result[emp_id].orders_shipped = count

    movements = db.execute(
        select(StockMovement.employee_id, StockMovement.movement_type, func.count(StockMovement.id),
               func.sum(StockMovement.quantity))
        .where(StockMovement.employee_id.in_(ids), _in_period(StockMovement.movement_time, start, end))
        .group_by(StockMovement.employee_id, StockMovement.movement_type)
    ).all()
    for emp_id, mtype, count, units in movements:
        if mtype == MovementType.IN:
            result[emp_id].stock_in_count = count
            result[emp_id].units_in = int(units)
        else:
            result[emp_id].units_shipped = int(units)
    return result


def timeline(db: Session, employee_ids: list[int], period: str, start: datetime, end: datetime) -> list[dict]:
    """Chart data: per day (week, month), per week (3 months) or per month (year)."""
    bucket = PERIOD_BUCKET[period]
    tz = str(local_tz())
    points = {d: {"date": d.isoformat(), "orders_shipped": 0, "orders_approved": 0, "stock_in_count": 0,
                  "units_shipped": 0, "points": 0}
              for d in bucket_series(start, end, bucket)}
    if not employee_ids:
        return list(points.values())

    def bucket_of(column):
        return func.date_trunc(bucket, func.timezone(tz, column)).label("bucket")

    queries = {
        "orders_shipped": select(bucket_of(Order.shipped_at), func.count(Order.id))
        .where(Order.shipped_by_id.in_(employee_ids), Order.status == OrderStatus.SHIPPED,
               _in_period(Order.shipped_at, start, end)),
        "orders_approved": select(bucket_of(Order.approved_at), func.count(Order.id))
        .where(Order.approved_by_id.in_(employee_ids), Order.status.in_(COUNTED_APPROVED),
               _in_period(Order.approved_at, start, end)),
        "stock_in_count": select(bucket_of(StockMovement.movement_time), func.count(StockMovement.id))
        .where(StockMovement.employee_id.in_(employee_ids), StockMovement.movement_type == MovementType.IN,
               _in_period(StockMovement.movement_time, start, end)),
        "units_shipped": select(bucket_of(StockMovement.movement_time), func.sum(StockMovement.quantity))
        .where(StockMovement.employee_id.in_(employee_ids), StockMovement.movement_type == MovementType.OUT,
               _in_period(StockMovement.movement_time, start, end)),
    }
    for key, stmt in queries.items():
        for bucket_dt, value in db.execute(stmt.group_by("bucket")).all():
            day: date = bucket_dt.date()
            if day in points:
                points[day][key] = int(value or 0)
    for p in points.values():
        p["points"] = (p["orders_shipped"] * POINTS_SHIPPED + p["orders_approved"] * POINTS_APPROVED
                       + p["stock_in_count"] * POINTS_STOCK_IN)
    return list(points.values())


def _rank(items: list, key) -> None:
    """Competition ranking: equal scores share a place (1, 2, 2, 4)."""
    items.sort(key=lambda x: (-key(x), getattr(x, "full_name", getattr(x, "team_name", ""))))
    previous, place = None, 0
    for index, item in enumerate(items, start=1):
        if key(item) != previous:
            place, previous = index, key(item)
        item.rank = place


def team_members(db: Session, manager: Employee) -> list[Employee]:
    workers = db.scalars(select(Employee).where(Employee.manager_id == manager.id).order_by(Employee.id)).all()
    return [manager, *workers]


def leaderboard(db: Session, period: str) -> list[TeamSummary]:
    start, end = period_range(period)
    managers = db.scalars(
        select(Employee).where(Employee.role == Role.MANAGER, Employee.is_active).order_by(Employee.id)
    ).all()
    teams = {m.id: team_members(db, m) for m in managers}
    all_members = [e for members in teams.values() for e in members]
    metrics = compute_metrics(db, all_members, start, end)

    summaries = []
    for manager in managers:
        members = teams[manager.id]
        s = TeamSummary(manager.id, manager.code, manager.full_name, manager.team_name, len(members),
                        member_ids=[e.id for e in members])
        for e in members:
            m = metrics[e.id]
            s.orders_shipped += m.orders_shipped
            s.orders_approved += m.orders_approved
            s.stock_in_count += m.stock_in_count
            s.units_shipped += m.units_shipped
            s.points += m.points
        summaries.append(s)
    _rank(summaries, key=lambda s: s.points)
    return summaries


def ranked_workers(db: Session, manager: Employee, period: str) -> list[dict]:
    start, end = period_range(period)
    workers = [e for e in team_members(db, manager) if e.id != manager.id]
    metrics = list(compute_metrics(db, workers, start, end).values())
    rows = [_RankRow(m) for m in metrics]
    _rank(rows, key=lambda r: r.metrics.points)
    return [r.metrics.to_dict() | {"rank": r.rank} for r in rows]


class _RankRow:
    def __init__(self, metrics: Metrics):
        self.metrics = metrics
        self.full_name = metrics.full_name
        self.rank = 0


def period_info(period: str) -> dict:
    start, end = period_range(period)
    return {"period": period, "start": start, "end": end, "bucket": PERIOD_BUCKET[period]}


def my_performance(db: Session, employee: Employee, period: str) -> dict:
    start, end = period_range(period)
    me = compute_metrics(db, [employee], start, end)[employee.id]
    data = period_info(period) | {
        "me": me.to_dict(),
        "timeline": timeline(db, [employee.id], period, start, end),
        "team": None,
        "rank_in_team": None,
        "team_size": None,
    }
    manager_id = employee.id if employee.role == Role.MANAGER else employee.manager_id
    if manager_id is not None:
        board = leaderboard(db, period)
        team = next((t for t in board if t.manager_id == manager_id), None)
        if team:
            data["team"] = team.to_dict() | {"teams_total": len(board)}
        if employee.role == Role.WORKER:
            # A Worker sees only his own place in the team, not the colleagues' numbers.
            manager = db.get(Employee, manager_id)
            ranking = ranked_workers(db, manager, period)
            data["rank_in_team"] = next((r["rank"] for r in ranking if r["employee_id"] == employee.id), None)
            data["team_size"] = len(ranking)
    return data


def team_performance(db: Session, manager: Employee, period: str) -> dict:
    start, end = period_range(period)
    members = team_members(db, manager)
    metrics = compute_metrics(db, members, start, end)
    board = leaderboard(db, period)
    team = next((t for t in board if t.manager_id == manager.id), None)
    return period_info(period) | {
        "team": team.to_dict() if team else None,
        "manager": metrics[manager.id].to_dict(),
        "workers": ranked_workers(db, manager, period),
        "timeline": timeline(db, [e.id for e in members], period, start, end),
    }


def all_performance(db: Session, period: str) -> dict:
    start, end = period_range(period)
    board = leaderboard(db, period)
    all_ids = [i for t in board for i in t.member_ids]
    totals = {k: sum(getattr(t, k) for t in board)
              for k in ("orders_shipped", "orders_approved", "stock_in_count", "units_shipped", "points")}
    return period_info(period) | {
        "totals": totals,
        "teams": [t.to_dict() for t in board],
        "timeline": timeline(db, all_ids, period, start, end),
    }
