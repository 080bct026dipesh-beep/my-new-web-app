from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Depends
from sqlalchemy.orm import Session

from app.routing.osrm_client import get_route_geometry, OSRMError
from app.routing.graph_builder import haversine_distance_m
from app.routing.time_buckets import day_and_bucket_for, now_in_nepal
from app.db.session import get_db, SessionLocal
from app.db import queries
from app.routing.pathfinder import find_shortest_path, NoRouteFoundError
from app.schemas import RouteFinderResult, RouteLeg, StopOut

router = APIRouter(tags=["route-finder"])

# Stops closer together than this are treated as effectively the same
# point for OSRM waypoint purposes. Forcing OSRM through every single
# stored stop — including ones only a few dozen metres apart — can push
# it into small loops on one-way streets just to legally hit each
# waypoint in order, which shows up as visible zigzagging on the map.
# Thinning keeps the route recognisable while giving OSRM room to pick
# a sane path between waypoints that are meaningfully far apart.
MIN_WAYPOINT_SPACING_M = 80


def _thin_waypoints(stops: list[StopOut]) -> list[tuple[float, float]]:
    if len(stops) < 2:
        return [(s.lat, s.lng) for s in stops]

    thinned = [(stops[0].lat, stops[0].lng)]
    for stop in stops[1:-1]:
        last_lat, last_lng = thinned[-1]
        if haversine_distance_m(last_lat, last_lng, stop.lat, stop.lng) >= MIN_WAYPOINT_SPACING_M:
            thinned.append((stop.lat, stop.lng))
    # Always keep the true final stop, even if it's close to the last
    # kept waypoint — it's the actual alight point, not optional.
    last = stops[-1]
    if thinned[-1] != (last.lat, last.lng):
        thinned.append((last.lat, last.lng))
    return thinned


def _attach_road_geometry(legs: list[RouteLeg]) -> None:
    for leg in legs:
        if leg.route_id == "TRANSFER":
            continue

        coords = _thin_waypoints(leg.stops)
        if len(coords) < 2:
            continue

        try:
            leg.road_geometry = get_route_geometry(coords)
        except OSRMError:
            pass


def _record_leg_congestion(legs: list[RouteLeg]) -> None:
    """Runs after the response is already sent (see BackgroundTasks in
    find_route below), so this never adds latency to a user's search. Each
    ride leg with real OSRM road_geometry becomes one upsert into
    segment_congestion_stats, bucketed by "now" in Nepal time -- an
    approximation of when the underlying trip would actually happen, good
    enough for an aggregate stat that only needs day-of-week/3-hour
    resolution.

    Opens its own DB session rather than reusing the request's, since the
    request's session is closed by the get_db dependency once the response
    finishes -- background tasks run after that.
    """
    day_of_week, hour_bucket = day_and_bucket_for(now_in_nepal())
    db = SessionLocal()
    try:
        for leg in legs:
            if leg.route_id == "TRANSFER" or leg.road_geometry is None:
                continue
            queries.record_congestion_sample(
                db,
                route_id=leg.route_id,
                from_stop_id=leg.board_stop.stop_id,
                to_stop_id=leg.alight_stop.stop_id,
                day_of_week=day_of_week,
                hour_bucket=hour_bucket,
                duration_s=leg.road_geometry["duration_s"],
                distance_m=leg.road_geometry["distance_m"],
            )
    finally:
        db.close()


@router.get("/walking-route")
def walking_route(
    from_lat: float = Query(..., ge=-90, le=90),
    from_lng: float = Query(..., ge=-180, le=180),
    to_lat: float = Query(..., ge=-90, le=90),
    to_lng: float = Query(..., ge=-180, le=180),
):
    """Foot-profile OSRM route from an arbitrary point (e.g. the user's
    detected location) to a stop. Separate from route-finder's driving-profile
    _attach_road_geometry since this is a single pedestrian leg, not a ride.
    """
    try:
        geometry = get_route_geometry([(from_lat, from_lng), (to_lat, to_lng)], profile="foot")
    except OSRMError as exc:
        raise HTTPException(status_code=502, detail=f"Couldn't compute walking route: {exc}")
    return geometry


@router.get("/route-finder", response_model=RouteFinderResult)
def find_route(
    background_tasks: BackgroundTasks,
    origin: str = Query(..., description="Origin stop_id, e.g. S0198"),
    destination: str = Query(..., description="Destination stop_id, e.g. S0021"),
    db: Session = Depends(get_db),
):
    try:
        result = find_shortest_path(db, origin, destination)
    except NoRouteFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    legs: list[RouteLeg] = []
    for seg in result.segments:
        seg_route_id = seg.route_id or "TRANSFER"
        to_stop = StopOut.model_validate(queries.get_stop(db, seg.to_stop_id))
        if legs and legs[-1].route_id == seg_route_id:
            legs[-1].alight_stop = to_stop
            legs[-1].num_ride_segments += 1
            legs[-1].stops.append(to_stop)
        else:
            from_stop = StopOut.model_validate(queries.get_stop(db, seg.from_stop_id))
            legs.append(
                RouteLeg(
                    route_id=seg_route_id,
                    route_name="Transfer (walk)" if seg.is_transfer else seg.route_id,
                    board_stop=from_stop,
                    alight_stop=to_stop,
                    num_ride_segments=1,
                    stops=[from_stop, to_stop],
                )
            )

    _attach_road_geometry(legs)

    background_tasks.add_task(_record_leg_congestion, legs)

    return RouteFinderResult(
        origin_stop_id=origin,
        destination_stop_id=destination,
        total_cost=result.total_distance_m,
        transfer_count=result.transfer_count,
        legs=legs,
    )