"""
routing/congestion_zones.py

Geographic congestion zones: fixed points (real measured Kathmandu
intersections, see data/congestion_zones.csv) each with a radius and a
severity-derived ratio, affecting ANY ride edge whose endpoint stop falls
within that radius -- regardless of which route it belongs to.

This is a different mechanism from app/db/queries.py's
segment_congestion_stats (the organic, time-bucketed, per-route-segment
system from Day 1/2): zones are static structural risk ("this
intersection is chronically bad") derived from a real traffic study,
while segment_congestion_stats is dynamic organic risk that accumulates
from real ride samples over time. pathfinder.py's weight function
combines both -- see _congestion_weight_fn's use of max(), so a segment
gets whichever signal is currently worse rather than double-penalizing.

Why radius-based rather than per-(route, segment) like the organic
system: a real traffic jam at an intersection affects every bus passing
through it, not just one operator's route. Tying severity to a specific
route_id (as the organic system necessarily does, since it learns from
observed ride durations per route) can't express that -- a zone can.
"""

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from app.routing.graph_builder import haversine_distance_m

ZONES_PATH = Path(__file__).resolve().parents[3] / "data" / "congestion_zones.csv"


@dataclass(frozen=True)
class CongestionZone:
    stop_id: str
    name: str
    lat: float
    lng: float
    radius_m: float
    ratio: float


def score_to_ratio(score: float) -> float:
    """Linear map from a real study's 0-10 Score to a congestion ratio
    (avg_duration_s / free_flow_duration_s). 0 -> ~1.05 (essentially
    free-flow); 10 -> 4.2 (severe, comfortably past the "heavy" >=1.5
    threshold in app/api/congestion.py). Shared with
    scripts/seed_demo_congestion.py so both mechanisms agree on what a
    given Score means in practice."""
    return 1.05 + (score / 10.0) * 3.15


def radius_for_score(score: float) -> float:
    """200m for a negligible spot up to 500m for the worst measured
    (score 10) -- real intersections back up traffic further into
    surrounding streets the more severe they are. Matches
    data/congestion_zones.csv's own radius_m column, kept here too so a
    caller can derive a radius for a score that isn't in the CSV."""
    return 200 + (score / 10.0) * 300


_zones_cache: list[CongestionZone] | None = None


def load_zones() -> list[CongestionZone]:
    """Loads data/congestion_zones.csv once per process. Safe to call
    repeatedly -- cached after the first call."""
    global _zones_cache
    if _zones_cache is not None:
        return _zones_cache

    zones = []
    if ZONES_PATH.exists():
        with open(ZONES_PATH, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                score = float(row["score"])
                zones.append(
                    CongestionZone(
                        stop_id=row["stop_id"],
                        name=row["stop_name"],
                        lat=float(row["lat"]),
                        lng=float(row["lng"]),
                        radius_m=float(row["radius_m"]),
                        ratio=score_to_ratio(score),
                    )
                )
    _zones_cache = zones
    return zones


def reset_zones_cache() -> None:
    """For tests, or after data/congestion_zones.csv changes without a
    process restart."""
    global _zones_cache
    _zones_cache = None


def ratio_for_point(lat: float, lng: float, zones: Sequence[CongestionZone] | None = None) -> float:
    """The congestion ratio in effect at a given point -- the MAXIMUM
    ratio among every zone whose radius contains it (not additive: two
    overlapping zones don't stack, the worse one just wins, matching how
    a single physical traffic jam works). Returns 1.0 (no effect) if the
    point isn't within any zone."""
    if zones is None:
        zones = load_zones()
    best = 1.0
    for zone in zones:
        if haversine_distance_m(lat, lng, zone.lat, zone.lng) <= zone.radius_m:
            best = max(best, zone.ratio)
    return best


def ratio_for_segment(
    from_lat: float,
    from_lng: float,
    to_lat: float,
    to_lng: float,
    zones: Sequence[CongestionZone] | None = None,
) -> float:
    """The congestion ratio for a ride segment -- the max of the ratio at
    EITHER endpoint, so a segment counts as affected if it starts or ends
    inside a zone (a straight-line/two-endpoint approximation of "this
    segment passes near the congested point", cheap and doesn't require
    stored road geometry)."""
    if zones is None:
        zones = load_zones()
    return max(
        ratio_for_point(from_lat, from_lng, zones),
        ratio_for_point(to_lat, to_lng, zones),
    )
