"""Who picks and ships an order: the Worker with the least open work.

Open work of a Worker = units (pieces) in his APPROVED orders that are not shipped yet.
New orders go to the least loaded Worker; rebalance() spreads all open orders again when the set of Workers
changes (a Worker is blocked, approved, unblocked, gets another role) or when a Manager asks for it.

Functions change the session but do not commit; the caller commits once.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models import Employee, Order, OrderItem, OrderStatus, Role, User, UserStatus
from app.models.common import utcnow


@dataclass
class Load:
    worker: Employee
    units: int = 0
    orders: int = 0

    def key(self):
        """Least units first, then fewer orders, then the older employee (stable, no randomness)."""
        return self.units, self.orders, self.worker.id


def active_workers(db: Session) -> list[Employee]:
    stmt = (
        select(Employee)
        .join(User, User.id == Employee.user_id)
        .where(Employee.role == Role.WORKER, Employee.is_active, User.status == UserStatus.ACTIVE)
        .order_by(Employee.id)
    )
    return list(db.scalars(stmt).all())


def order_units(order: Order) -> int:
    return sum(i.quantity for i in order.items)


def workloads(db: Session) -> dict[int, Load]:
    """{worker id: Load} for every active Worker, including those with nothing to do."""
    loads = {w.id: Load(w) for w in active_workers(db)}
    stmt = (
        select(Order.assigned_to_id, func.sum(OrderItem.quantity), func.count(func.distinct(Order.id)))
        .join(OrderItem, OrderItem.order_id == Order.id)
        .where(Order.status == OrderStatus.APPROVED, Order.assigned_to_id.is_not(None))
        .group_by(Order.assigned_to_id)
    )
    for worker_id, units, orders in db.execute(stmt):
        if worker_id in loads:
            loads[worker_id].units, loads[worker_id].orders = int(units), orders
    return loads


def assign(db: Session, order: Order, at: datetime | None = None) -> Employee | None:
    """Gives the order to the least loaded Worker. No active Workers -> stays unassigned (common queue)."""
    db.flush()  # the order's own lines must not be counted twice and earlier assignments must be visible
    loads = [load for load in workloads(db).values()]
    if not loads:
        order.assigned_to_id, order.assigned_at = None, None
        return None
    worker = min(loads, key=Load.key).worker
    order.assigned_to_id = worker.id
    order.assigned_at = at or utcnow()
    return worker


def rebalance(db: Session, at: datetime | None = None) -> int:
    """Spreads ALL open orders evenly: biggest orders first, each to the currently least loaded Worker.

    Returns how many orders changed hands.
    """
    db.flush()
    workers = active_workers(db)
    orders = db.scalars(
        select(Order).where(Order.status == OrderStatus.APPROVED).options(selectinload(Order.items))
        .order_by(Order.created_at, Order.id)
    ).all()
    if not workers:
        moved = sum(1 for o in orders if o.assigned_to_id is not None)
        for o in orders:
            o.assigned_to_id, o.assigned_at = None, None
        return moved

    loads = {w.id: Load(w) for w in workers}
    when = at or utcnow()
    moved = 0
    # Largest first (LPT): keeps the difference between Workers within about one order.
    for order in sorted(orders, key=lambda o: (-order_units(o), o.created_at, o.id)):
        best = min(loads.values(), key=Load.key)
        # Keep the current Worker if he is as good as the best one: fewer needless moves.
        current = loads.get(order.assigned_to_id)
        target = current if current and (current.units, current.orders) <= (best.units, best.orders) else best
        if order.assigned_to_id != target.worker.id:
            order.assigned_to_id, order.assigned_at = target.worker.id, when
            moved += 1
        target.units += order_units(order)
        target.orders += 1
    return moved


def assign_unassigned(db: Session) -> int:
    """APPROVED orders without a Worker (e.g. there were no Workers) get one."""
    orders = db.scalars(
        select(Order).where(Order.status == OrderStatus.APPROVED, Order.assigned_to_id.is_(None))
        .order_by(Order.created_at, Order.id)
    ).all()
    count = 0
    for order in orders:
        if assign(db, order):
            count += 1
    return count
