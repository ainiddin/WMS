from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.config import settings

PERIOD_DAYS = {"week": 7, "month": 30, "quarter": 90, "year": 365}
# Chart step per period: days for week/month, weeks for 3 months, months for a year.
PERIOD_BUCKET = {"week": "day", "month": "day", "quarter": "week", "year": "month"}


def local_tz() -> ZoneInfo:
    return ZoneInfo(settings.APP_TIMEZONE)


def period_range(period: str, now: datetime | None = None) -> tuple[datetime, datetime]:
    """Last 7 / 30 / 90 / 365 days up to now, counted from local midnight."""
    now = now or datetime.now(UTC)
    today = now.astimezone(local_tz()).date()
    start_day = today - timedelta(days=PERIOD_DAYS[period] - 1)
    start = datetime.combine(start_day, datetime.min.time(), local_tz())
    return start, now


def bucket_start(d: date, bucket: str) -> date:
    if bucket == "week":
        return d - timedelta(days=d.weekday())
    if bucket == "month":
        return d.replace(day=1)
    return d


def bucket_series(start: datetime, end: datetime, bucket: str) -> list[date]:
    """All bucket start dates between start and end, so the chart has zeros instead of gaps."""
    tz = local_tz()
    current = bucket_start(start.astimezone(tz).date(), bucket)
    last = end.astimezone(tz).date()
    out = []
    while current <= last:
        out.append(current)
        if bucket == "day":
            current += timedelta(days=1)
        elif bucket == "week":
            current += timedelta(weeks=1)
        else:
            current = (current.replace(day=28) + timedelta(days=4)).replace(day=1)
    return out
