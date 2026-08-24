"""One-off (safe to re-run) script to populate routes.osrm_distance_km --
the real road distance for each active route's full ordered stop
sequence, computed by calling OSRM once per route (using the same
waypoint-thinning as the live route-finder's road_geometry, see
api/routing.py::_thin_waypoints, so a route's summary distance matches
what a rider would actually see per-leg).

This replaces relying on approx_distance_km (source-data-supplied,
occasionally flagged/incorrect -- see distance_flagged_for_recompute)
or haversine_distance_km (straight-line, systematically shorter than
real road distance) for anything shown to users as "distance".

Run from backend/, against a live OSRM instance:
    python3 scripts/compute_osrm_route_distances.py

Only rewrites routes whose osrm_distance_km is still null, so it's
cheap to re-run after adding new routes -- pass --force to recompute
every active route instead (e.g. after a stop-coordinate correction).
"""
import argparse
import sys
import time

from app.db import queries
from app.db.session import SessionLocal
from app.routing.graph_builder import haversine_distance_m
from app.routing.osrm_client import OSRMError, get_route_geometry

MIN_WAYPOINT_SPACING_M = 80  # mirrors api/routing.py::MIN_WAYPOINT_SPACING_M


def _thin_waypoints(coords: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if len(coords) < 2:
        return coords
    thinned = [coords[0]]
    for lat, lng in coords[1:-1]:
        last_lat, last_lng = thinned[-1]
        if haversine_distance_m(last_lat, last_lng, lat, lng) >= MIN_WAYPOINT_SPACING_M:
            thinned.append((lat, lng))
    last = coords[-1]
    if thinned[-1] != last:
        thinned.append(last)
    return thinned


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force",
        action="store_true",
        help="Recompute even routes that already have an osrm_distance_km.",
    )
    args = parser.parse_args()

    db = SessionLocal()
    updated = 0
    skipped = 0
    try:
        routes = queries.get_active_routes(db)
        pending = [r for r in routes if args.force or r.osrm_distance_km is None]
        print(f"{len(routes)} active routes, {len(pending)} to compute...")

        for i, route in enumerate(pending, start=1):
            ordered = sorted(
                (rs for rs in route.route_stops if rs.stop is not None),
                key=lambda rs: rs.sequence_no,
            )
            coords = _thin_waypoints([(rs.stop.lat, rs.stop.lng) for rs in ordered])
            if len(coords) < 2:
                skipped += 1
                continue

            try:
                geometry = get_route_geometry(coords)
            except OSRMError as exc:
                skipped += 1
                print(f"  [{i}/{len(pending)}] {route.route_id}: OSRM failed ({exc}), skipped")
                continue

            route.osrm_distance_km = round(geometry["distance_m"] / 1000, 2)
            db.add(route)
            updated += 1
            if i % 20 == 0:
                db.commit()
            print(f"  [{i}/{len(pending)}] {route.route_id}: {route.osrm_distance_km} km")

        db.commit()
        print(f"Done. Updated {updated}, skipped {skipped}.")
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
