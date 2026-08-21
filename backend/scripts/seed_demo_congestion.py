"""
scripts/seed_demo_congestion.py

Seeds REALISTIC peak-hour congestion samples on real segments departing the
8 demo corridors (Koteshwor, Kalanki, Thapathali, Chabahil, Jadibuti,
Tripureshwor, Maitighar, Gongabu Bus Park), so avoid_congestion=true on
/route-finder has real data to route around instead of an empty table.

This is NOT the same as scripts/seed_congestion_stats.py -- that one writes
a flat synthetic baseline into every bucket (no congestion anywhere, just a
free-flow guess). This script additionally injects a heavy REAL sample into
one specific peak-hour bucket per segment, on top of that baseline, so the
congestion ratio for that bucket is genuinely > 1 and avoid_congestion=true
produces a visibly different result -- see docs/congestion-demo.md for the
exact before/after this produces.

Run after scripts/seed_congestion_stats.py (or independently -- it seeds
its own baseline for each segment it touches either way):
    python -m scripts.seed_demo_congestion

Safe to re-run: each call just re-records another sample into the same
(day_of_week, hour_bucket) via the normal EMA blend in
queries.record_congestion_sample, it doesn't duplicate rows.
"""

from app.db.session import SessionLocal
from app.db import queries
from app.routing.time_buckets import day_and_bucket_for, now_in_nepal

# (route_id, from_stop_id, to_stop_id, free_flow_distance_m) -- all real
# segments, pulled from the live routing graph, one departing each of the
# 8 demo corridors. free_flow duration is derived assuming ~20km/h average
# city-bus speed; the "congested" sample triples that (a ratio of ~3.2,
# solidly in the "heavy" band under app/api/congestion.py's thresholds).
DEMO_SEGMENTS = [
    # Tripureshwor -> NAC (shared R-SAJHA-01/02 corridor -- congesting this
    # causes a genuine route SWITCH to R-SAJHA-02 for that leg, since both
    # routes serve the identical physical stops here. See congestion-demo.md.
    ("R-SAJHA-01", "S0056", "S0236", 1466.0),
    ("R-SAJHA-01", "S0236", "S0152", 168.0),
    ("R-SAJHA-01", "S0152", "S0087", 1129.0),
    # Maitighar-bound trunk hop toward Gongabu Bus Park -- congesting this
    # triggers a full REROUTE via different feeder routes (R3211395 ->
    # R3028077 -> R-SAJHA-06) rather than a same-route swap, since
    # R-SAJHA-01 is the only route serving Gongabu Bus Park at all.
    ("R-SAJHA-01", "S0044", "S0065", 1565.0),
    # Broader coverage: one real onward segment from each remaining
    # corridor, so /congestion has genuine (non-seeded) data to show at
    # all 8 points, even where no alternate route exists to demo a switch.
    ("R-NY-03", "S0107", "S0185", 3351.6),   # Koteshwor -> Thapathali
    ("R-SAJHA-06", "S0130", "S0246", 999.0),  # Kalanki -> onward
    ("R-NY-03", "S0185", "S0056", 483.1),     # Thapathali -> Tripureshwor
    ("R3102605", "S0195", "S0052", 576.5),    # Chabahil -> onward
    ("R-NY-03", "S0159", "S0107", 568.1),     # Jadibuti -> Koteshwor
]

# Ratio between congested and free-flow duration for the injected sample.
# 3.2 lands solidly in "heavy" per app/api/congestion.py's >=1.5 threshold.
CONGESTION_MULTIPLIER = 3.2

# Assumed average free-flow city-bus speed, used only to turn a real
# distance into a plausible free-flow duration for the seed.
FREE_FLOW_SPEED_MPS = 20_000 / 3600  # ~20 km/h


def main() -> None:
    session = SessionLocal()
    day_of_week, hour_bucket = day_and_bucket_for(now_in_nepal())
    print(f"Seeding demo congestion for day_of_week={day_of_week}, hour_bucket={hour_bucket}")

    for route_id, from_stop_id, to_stop_id, distance_m in DEMO_SEGMENTS:
        free_flow_duration_s = distance_m / FREE_FLOW_SPEED_MPS
        congested_duration_s = free_flow_duration_s * CONGESTION_MULTIPLIER

        queries.seed_congestion_baseline(
            session,
            route_id=route_id,
            from_stop_id=from_stop_id,
            to_stop_id=to_stop_id,
            duration_s=free_flow_duration_s,
            distance_m=distance_m,
        )
        queries.record_congestion_sample(
            session,
            route_id=route_id,
            from_stop_id=from_stop_id,
            to_stop_id=to_stop_id,
            day_of_week=day_of_week,
            hour_bucket=hour_bucket,
            duration_s=congested_duration_s,
            distance_m=distance_m,
        )
        print(
            f"  {route_id}: {from_stop_id} -> {to_stop_id}  "
            f"free_flow={free_flow_duration_s:.0f}s  congested={congested_duration_s:.0f}s  "
            f"ratio={CONGESTION_MULTIPLIER}"
        )

    session.close()
    print("\nDone. Try GET /route-finder?origin=S0056&destination=S0072&avoid_congestion=true")
    print("vs the same call with avoid_congestion=false, at this same hour, to see the difference.")


if __name__ == "__main__":
    main()
