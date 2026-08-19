"""
Data-access helpers for the Kathmandu Bus Route Finder.

Spatial lookups go through PostGIS via GeoAlchemy2 against stops.geom.
Everything else is plain SQLAlchemy ORM. All functions take a live
Session so callers control transaction/connection lifecycle.
"""

from typing import List, Optional, Sequence

from geoalchemy2.functions import ST_Distance, ST_DWithin, ST_GeogFromText
from sqlalchemy import case, func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, selectinload


from ..models import FareRule, Operator, Route, RouteOperator, RouteStop, Stop, SegmentCongestionStat


def nearest_stops(
    session: Session,
    lat: float,
    lng: float,
    radius_m: int = 500,
    limit: int = 10,
) -> Sequence[Stop]:
    """Stops within radius_m metres of (lat, lng), nearest first."""
    point = ST_GeogFromText(f"SRID=4326;POINT({lng} {lat})")
    stmt = (
        select(Stop)
        .where(ST_DWithin(Stop.geom, point, radius_m))
        .order_by(ST_Distance(Stop.geom, point))
        .limit(limit)
    )
    return session.execute(stmt).scalars().all()


def get_stop(session: Session, stop_id: str) -> Optional[Stop]:
    return session.get(Stop, stop_id)


def get_route(session: Session, route_id: str) -> Optional[Route]:
    """Route with its ordered stops and operators eager-loaded."""
    stmt = (
        select(Route)
        .where(Route.route_id == route_id)
        .options(
            selectinload(Route.route_stops).selectinload(RouteStop.stop),
            selectinload(Route.route_operators).selectinload(RouteOperator.operator),
        )
    )
    return session.execute(stmt).scalar_one_or_none()


def get_route_stops(session: Session, route_id: str) -> Sequence[RouteStop]:
    """Stops on a route, in sequence_no order, each with its Stop eager-loaded."""
    stmt = (
        select(RouteStop)
        .where(RouteStop.route_id == route_id)
        .options(selectinload(RouteStop.stop))
        .order_by(RouteStop.sequence_no)
    )
    return session.execute(stmt).scalars().all()


def get_operator(session: Session, operator_id: str) -> Optional[Operator]:
    return session.get(Operator, operator_id)


def list_routes_by_stop(session: Session, stop_id: str) -> Sequence[Route]:
    """All routes that pass through a given stop."""
    stmt = (
        select(Route)
        .join(RouteStop, RouteStop.route_id == Route.route_id)
        .where(RouteStop.stop_id == stop_id)
        .distinct()
    )
    return session.execute(stmt).scalars().all()


def list_stops(
    session: Session,
    district: Optional[str] = None,
    status: str = "active",
    limit: int = 100,
    offset: int = 0,
) -> Sequence[Stop]:
    """Paged stop listing, optionally filtered by district."""
    stmt = select(Stop).where(Stop.status == status)
    if district:
        stmt = stmt.where(Stop.district == district)
    stmt = stmt.order_by(Stop.stop_id).limit(limit).offset(offset)
    return session.execute(stmt).scalars().all()


def fare_for_distance(session: Session, distance_km: float) -> Optional[FareRule]:
    """Fare band whose [min, max) range covers distance_km."""
    stmt = (
        select(FareRule)
        .where(FareRule.min_distance_km <= distance_km)
        .where(FareRule.max_distance_km > distance_km)
    )
    return session.execute(stmt).scalar_one_or_none()


# --- Added for GET /stops pagination and the routing graph builder ---


def count_stops(session: Session, status: str = "active") -> int:
    """Total stops matching `status`, for pagination totals alongside list_stops()."""
    stmt = select(func.count()).select_from(Stop).where(Stop.status == status)
    return session.execute(stmt).scalar_one()


def get_active_routes(session: Session) -> Sequence[Route]:
    """
    Active routes with their ordered stops eager-loaded in one query.
    Used by app/routing/graph_builder.py to build the NetworkX graph —
    avoids one query per route + one per route_stop (N+1) while building it.
    """
    stmt = (
        select(Route)
        .where(Route.status == "active")
        .options(selectinload(Route.route_stops).selectinload(RouteStop.stop))
    )
    return session.execute(stmt).scalars().all()


def list_routes(
    session: Session,
    status: str = "active",
    q: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Sequence[Route]:
    """Paged route listing for the route browser (app/api/routes.py::list_routes
    endpoint), optionally filtered by a case-insensitive substring match on
    route_name. Deliberately lean -- no route_stops eager-loaded here, unlike
    get_active_routes/get_route, since the browser only needs stops for
    whichever single route the user expands (GET /routes/{route_id}/stops)."""
    stmt = select(Route).where(Route.status == status)
    if q:
        stmt = stmt.where(Route.route_name.ilike(f"%{q}%"))
    stmt = stmt.order_by(Route.route_name).limit(limit).offset(offset)
    return session.execute(stmt).scalars().all()


def count_routes(session: Session, status: str = "active", q: Optional[str] = None) -> int:
    """Total routes matching `status`/`q`, for pagination totals alongside list_routes()."""
    stmt = select(func.count()).select_from(Route).where(Route.status == status)
    if q:
        stmt = stmt.where(Route.route_name.ilike(f"%{q}%"))
    return session.execute(stmt).scalar_one()


# --- Historical congestion stats (app/api/congestion.py) ---
#
# segment_congestion_stats is an *aggregate* table (see the model
# docstring for the sizing math), upserted per sample rather than
# appended to, so record_congestion_sample and get_congestion_stats are
# the only two entry points that ever touch it.


def record_congestion_sample(
    session: Session,
    *,
    route_id: str,
    from_stop_id: str,
    to_stop_id: str,
    day_of_week: int,
    hour_bucket: int,
    duration_s: float,
    distance_m: float,
) -> None:
    """Upsert one real (organic) OSRM observation into the running average
    for this segment/time-bucket.

    If the existing row is still just the synthetic seed written by
    scripts/seed_congestion_stats.py (is_seeded and sample_count <= 1),
    this sample REPLACES it outright rather than blending in -- so one
    guessed baseline doesn't permanently bias the historical average
    once real traffic data starts arriving.
    """
    table = SegmentCongestionStat.__table__
    stmt = pg_insert(table).values(
        route_id=route_id,
        from_stop_id=from_stop_id,
        to_stop_id=to_stop_id,
        day_of_week=day_of_week,
        hour_bucket=hour_bucket,
        avg_duration_s=duration_s,
        avg_distance_m=distance_m,
        sample_count=1,
        is_seeded=False,
    )
    excluded = stmt.excluded
    replace_seed = table.c.is_seeded & (table.c.sample_count <= 1)

    stmt = stmt.on_conflict_do_update(
        constraint="uq_segment_congestion_key",
        set_={
            "avg_duration_s": case(
                (replace_seed, excluded.avg_duration_s),
                else_=(
                    (table.c.avg_duration_s * table.c.sample_count + excluded.avg_duration_s)
                    / (table.c.sample_count + 1)
                ),
            ),
            "avg_distance_m": case(
                (replace_seed, excluded.avg_distance_m),
                else_=(
                    (table.c.avg_distance_m * table.c.sample_count + excluded.avg_distance_m)
                    / (table.c.sample_count + 1)
                ),
            ),
            "sample_count": case(
                (replace_seed, 1),
                else_=table.c.sample_count + 1,
            ),
            "is_seeded": False,
            "updated_at": text("now()"),
        },
    )
    session.execute(stmt)
    session.commit()


def seed_congestion_baseline(
    session: Session,
    *,
    route_id: str,
    from_stop_id: str,
    to_stop_id: str,
    duration_s: float,
    distance_m: float,
) -> None:
    """Write a synthetic baseline into all 8 hour buckets for every day of
    the week, so the congestion map isn't empty before real traffic
    accumulates. Used by scripts/seed_congestion_stats.py. A no-op (does
    nothing, doesn't overwrite) for any bucket that already has organic
    data, so re-running the seed script is always safe.
    """
    table = SegmentCongestionStat.__table__
    rows = [
        {
            "route_id": route_id,
            "from_stop_id": from_stop_id,
            "to_stop_id": to_stop_id,
            "day_of_week": dow,
            "hour_bucket": hour,
            "avg_duration_s": duration_s,
            "avg_distance_m": distance_m,
            "sample_count": 1,
            "is_seeded": True,
        }
        for dow in range(7)
        for hour in (0, 3, 6, 9, 12, 15, 18, 21)
    ]
    stmt = pg_insert(table).values(rows)
    stmt = stmt.on_conflict_do_nothing(constraint="uq_segment_congestion_key")
    session.execute(stmt)
    session.commit()


def get_congestion_stats(
    session: Session, day_of_week: int, hour_bucket: int
) -> Sequence:
    """Every segment with data for this (day_of_week, hour_bucket), each
    row paired with that segment's own free-flow baseline -- the minimum
    avg_duration_s across all of its buckets -- so callers can turn it
    into a congestion ratio without a second round-trip. See
    app/api/congestion.py for how the ratio becomes free_flow/moderate/heavy.
    """
    T = SegmentCongestionStat
    baseline = (
        select(
            T.route_id.label("route_id"),
            T.from_stop_id.label("from_stop_id"),
            T.to_stop_id.label("to_stop_id"),
            func.min(T.avg_duration_s).label("free_flow_duration_s"),
        )
        .group_by(T.route_id, T.from_stop_id, T.to_stop_id)
        .subquery()
    )
    stmt = (
        select(T, baseline.c.free_flow_duration_s)
        .join(
            baseline,
            (T.route_id == baseline.c.route_id)
            & (T.from_stop_id == baseline.c.from_stop_id)
            & (T.to_stop_id == baseline.c.to_stop_id),
        )
        .where(T.day_of_week == day_of_week, T.hour_bucket == hour_bucket)
    )
    return session.execute(stmt).all()