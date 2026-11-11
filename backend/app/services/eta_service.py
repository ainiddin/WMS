"""How long a customer will probably wait for goods that are not in stock.

Estimated from the history of deliveries (IN movements) of the product: the usual gap between two deliveries
minus the days since the last one. The answer is a range of days, because deliveries are not exact.
"""

import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import quantiles

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import MovementType, StockMovement
from app.models.common import utcnow

DEFAULT_ETA = (3, 7)  # no history yet
HISTORY_DAYS = 180


@dataclass
class Eta:
    min_days: int
    max_days: int


def product_eta(db: Session, product_id: int, now: datetime | None = None) -> Eta:
    now = now or utcnow()
    times = db.scalars(
        select(StockMovement.movement_time)
        .where(StockMovement.product_id == product_id, StockMovement.movement_type == MovementType.IN,
               StockMovement.movement_time >= now - timedelta(days=HISTORY_DAYS),
               StockMovement.movement_time <= now)
        .order_by(StockMovement.movement_time)
    ).all()
    gaps = [(b - a).total_seconds() / 86400 for a, b in zip(times, times[1:])]
    gaps = [g for g in gaps if g >= 0.5]  # two scans of one delivery are not two deliveries
    if len(gaps) < 2:
        return Eta(*DEFAULT_ETA)
    q1, _, q3 = quantiles(gaps, n=4) if len(gaps) >= 4 else (min(gaps), None, max(gaps))
    since_last = (now - times[-1]).total_seconds() / 86400
    low, high = q1 - since_last, q3 - since_last
    if high < 1:  # the delivery is late: it should come any day now
        return Eta(1, 3)
    low = max(1, round(low))
    return Eta(low, max(low + 1, math.ceil(high)))


def order_eta(db: Session, product_ids, now: datetime | None = None) -> Eta | None:
    """The order is complete when its slowest product arrives."""
    etas = [product_eta(db, pid, now) for pid in product_ids]
    if not etas:
        return None
    return Eta(max(e.min_days for e in etas), max(e.max_days for e in etas))
