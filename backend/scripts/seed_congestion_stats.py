"""One-off (safe to re-run) script to seed segment_congestion_stats with a
baseline duration/distance for every consecutive stop-pair on every active
route, so GET /congestion isn't empty before real search traffic has had
time to populate it organically (see api/routing.py::_record_leg_congestion).

Makes exactly one OSRM call per consecutive stop-pair (not per time
bucket -- see queries.seed_congestion_baseline, which fans that one
duration out to all 7 days x 8 hour-buckets). For a network with a few
hundred routes and a handful of stops each, that's on the order of a few
thousand OSRM calls total, a few seconds each at most -- fine to run
as a one-off, and safe to re-run any time (existing rows, seeded or real,
are never overwritten -- see ON CONFLICT DO NOTHING in
queries.seed_congestion_baseline).

Run from backend/:  python3 scripts/seed_congestion_stats.py
"""
import sys
import time

from app.db import queries
from app.db.session import SessionLocal
from app.routing.osrm_client import OSRMError, get_route_geometry


def main() -> None:
    db = SessionLocal()
    seeded = 0
    skipped = 0
    try:
        routes = queries.get_active_routes(db)
        total_pairs = sum(max(len(r.route_stops) - 1, 0) for r in routes)
        print(f"Seeding congestion baseline for {len(routes)} routes, {total_pairs} stop-pairs...")

        done = 0
        for route in routes:
            ordered = sorted(
                (rs for rs in route.route_stops if rs.stop is not None),
                key=lambda rs: rs.sequence_no,
            )
            for a, b in zip(ordered, ordered[1:]):
                done += 1
                try:
                    geometry = get_route_geometry(
                        [(a.stop.lat, a.stop.lng), (b.stop.lat, b.stop.lng)]
                    )
                    queries.seed_congestion_baseline(
                        db,
                        route_id=route.route_id,
                        from_stop_id=a.stop_id,
                        to_stop_id=b.stop_id,
                        duration_s=geometry["duration_s"],
                        distance_m=geometry["distance_m"],
                    )
                    seeded += 1
                except OSRMError as exc:
                    # OSRM unreachable, or this particular pair failed to
                    # route (e.g. one stop off the road network) -- skip
                    # and keep going rather than aborting the whole run.
                    skipped += 1
                    print(
                        f"  skip {route.route_id} {a.stop_id}->{b.stop_id}: {exc}",
                        file=sys.stderr,
                    )

                if done % 50 == 0:
                    print(f"  {done}/{total_pairs} pairs processed...")
                    time.sleep(0.1)  # be polite to a shared local OSRM instance

        print(f"Done. Seeded {seeded} stop-pairs, skipped {skipped}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
