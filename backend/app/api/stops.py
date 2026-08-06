"""Read-only stop lookup endpoints.

Scrum 6 note (see backend/tests/test_stops.py): this module is the
"app/db/data_access.py" the placeholder test was waiting on -- the
nearest-stop / search logic lives here rather than a separate
data-access module, since FastAPI + SQLAlchemy makes a thin
router-does-the-query split easy to follow for a project this size.
"""

from geoalchemy2 import Geography
from geoalchemy2.functions import ST_DWithin, ST_MakePoint, ST_SetSRID
from geoalchemy2.shape import to_shape
from sqlalchemy import cast, func, or_
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import get_settings
from app.db.session import get_db
from app.models import Stop as StopORM

from .schemas import StopOut

router = APIRouter()


def _to_stop_out(row: StopORM) -> StopOut:
    point = to_shape(row.geom)
    return StopOut(
        stop_id=row.stop_id,
        name=row.name,
        lat=point.y,
        lng=point.x,
        is_interchange=row.is_interchange,
        verified=row.verified,
    )


@router.get("", response_model=list[StopOut])
def list_stops(
    q: str | None = Query(default=None, description="Case-insensitive substring match on stop name."),
    verified_only: bool = Query(default=False),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[StopOut]:
    """List stops, optionally filtered by a name search and/or verified status."""
    query = db.query(StopORM)
    if q:
        needle = q.strip().lower()
        query = query.filter(or_(StopORM.name_normalized.ilike(f"%{needle}%"), StopORM.name.ilike(f"%{needle}%")))
    if verified_only:
        query = query.filter(StopORM.verified.is_(True))
    rows = query.order_by(StopORM.name).limit(limit).all()
    return [_to_stop_out(r) for r in rows]


@router.get("/nearest", response_model=list[StopOut])
def nearest_stops(
    lat: float = Query(ge=-90, le=90),
    lng: float = Query(ge=-180, le=180),
    radius_m: int | None = Query(default=None, ge=1, le=5000, description="Search radius in metres."),
    limit: int = Query(default=5, ge=1, le=50),
    db: Session = Depends(get_db),
) -> list[StopOut]:
    """Return the closest stops to a coordinate, nearest first.

    Uses a geography cast so ST_DWithin's radius is in metres rather
    than degrees, and orders by true geographic distance rather than
    raw coordinate distance.
    """
    settings = get_settings()
    effective_radius = radius_m or settings.default_nearest_stop_radius_m

    point = ST_SetSRID(ST_MakePoint(lng, lat), 4326)
    stop_geog = cast(StopORM.geom, Geography)
    point_geog = cast(point, Geography)
    distance = func.ST_Distance(stop_geog, point_geog)

    rows = (
        db.query(StopORM)
        .filter(ST_DWithin(stop_geog, point_geog, effective_radius))
        .order_by(distance)
        .limit(limit)
        .all()
    )
    return [_to_stop_out(r) for r in rows]


@router.get("/{stop_id}", response_model=StopOut)
def get_stop(stop_id: int, db: Session = Depends(get_db)) -> StopOut:
    row = db.get(StopORM, stop_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Stop {stop_id} not found.")
    return _to_stop_out(row)
