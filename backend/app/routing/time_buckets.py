"""Shared day-of-week / hour-bucket logic for historical congestion stats.

Used by both the write path (api/routing.py, logging real OSRM samples)
and the read path (api/congestion.py, querying them) so the two can never
disagree about bucket boundaries.
"""
from datetime import datetime, timedelta, timezone

# Nepal Standard Time is UTC+5:45 and doesn't observe DST, so a fixed
# offset is correct year-round -- no zoneinfo/tzdata dependency needed.
NEPAL_TZ = timezone(timedelta(hours=5, minutes=45))

HOUR_BUCKETS = (0, 3, 6, 9, 12, 15, 18, 21)


def now_in_nepal() -> datetime:
    return datetime.now(NEPAL_TZ)


def hour_bucket_start(hour: int) -> int:
    """Round an hour (0-23) down to its 3-hour bucket start."""
    return (hour // 3) * 3


def day_and_bucket_for(dt: datetime) -> tuple[int, int]:
    """(day_of_week, hour_bucket) for a datetime, per Nepal local time.

    day_of_week follows Python's date.weekday(): 0=Monday .. 6=Sunday.
    """
    local = dt.astimezone(NEPAL_TZ)
    return local.weekday(), hour_bucket_start(local.hour)
