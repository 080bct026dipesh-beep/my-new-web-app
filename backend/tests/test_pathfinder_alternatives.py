"""
tests/test_pathfinder_alternatives.py

Regression tests for the include_alternatives feature added to
find_shortest_path. Same lightweight monkeypatch approach as
test_routing.py -- no live database required.
"""
from types import SimpleNamespace

import pytest

from app.routing import graph_builder as gb
from app.routing.pathfinder import find_shortest_path


def make_stop(stop_id, name, lat, lng):
    return SimpleNamespace(stop_id=stop_id, stop_name=name, lat=lat, lng=lng)


def make_route(route_id, stops, bidirectional=True, status="active"):
    route_stops = [
        SimpleNamespace(stop_id=s.stop_id, sequence_no=i, stop=s)
        for i, s in enumerate(stops, start=1)
    ]
    return SimpleNamespace(
        route_id=route_id,
        route_stops=route_stops,
        is_bidirectional=bidirectional,
        status=status,
    )


@pytest.fixture(autouse=True)
def _reset_graph_cache():
    gb.invalidate_graph_cache()
    yield
    gb.invalidate_graph_cache()


def test_alternatives_empty_by_default(monkeypatch):
    """include_alternatives defaults to False -- existing callers see
    exactly today's response shape (an empty list), not a behavior
    change they didn't ask for."""
    s1 = make_stop("S1", "A", 27.700, 85.310)
    s2 = make_stop("S2", "B", 27.701, 85.311)
    route = make_route("R_A", [s1, s2])
    monkeypatch.setattr(gb, "get_active_routes", lambda session: [route])

    result = find_shortest_path(session=None, origin_stop_id="S1", destination_stop_id="S2")
    assert result.alternatives == []


def test_direct_route_alternatives_surface_a_second_real_route(monkeypatch):
    """Two different active routes both connect S1 -> S3 directly: the
    shorter one should win as primary, the longer one should appear as
    an 'alternate_direct_route' alternative -- real data, not estimated."""
    s1 = make_stop("S1", "A", 27.7000, 85.3100)
    s2 = make_stop("S2", "B", 27.7010, 85.3110)
    s3 = make_stop("S3", "C", 27.7020, 85.3120)

    # Short: S1 -> S3 direct (skips S2 entirely).
    route_short = make_route("R_SHORT", [s1, s3])
    # Long: S1 -> S2 -> S3 (same endpoints, more distance).
    route_long = make_route("R_LONG", [s1, s2, s3])

    monkeypatch.setattr(gb, "get_active_routes", lambda session: [route_short, route_long])

    result = find_shortest_path(
        session=None,
        origin_stop_id="S1",
        destination_stop_id="S3",
        include_alternatives=True,
    )

    assert result.transfer_count == 0
    assert result.segments[0].route_id == "R_SHORT"

    assert len(result.alternatives) == 1
    alt = result.alternatives[0]
    assert alt.label == "alternate_direct_route"
    assert alt.segments[0].route_id == "R_LONG"
    assert alt.total_distance_m > result.total_distance_m


def test_direct_route_alternatives_dedupe_same_route_id(monkeypatch):
    """A loop route can match the same origin/destination pair twice
    (different occurrences) -- that should never produce two
    'alternatives' on the same route_id, since it isn't a meaningfully
    different option for a rider."""
    s1 = make_stop("S1", "A", 27.7000, 85.3100)
    s2 = make_stop("S2", "B", 27.7010, 85.3110)
    s3 = make_stop("S3", "C", 27.7020, 85.3120)
    # Loop: S1 -> S2 -> S3 -> S1 (S1 occurs twice; not bidirectional so
    # the only forward path S1->S3 is via S2).
    loop_route = make_route("R_LOOP", [s1, s2, s3, s1], bidirectional=False)

    monkeypatch.setattr(gb, "get_active_routes", lambda session: [loop_route])

    result = find_shortest_path(
        session=None,
        origin_stop_id="S1",
        destination_stop_id="S3",
        include_alternatives=True,
    )
    assert result.alternatives == []


def test_transfer_scenario_alternatives_dedupe_to_empty_when_only_one_path_exists(monkeypatch):
    """Mirrors test_routing.py's two_route_network transfer case: there's
    only one viable stop sequence between S1 and S6 (via the S2/S5
    interchange), so shortest_distance and fastest_estimated should both
    collapse (dedupe) onto the same primary path rather than appearing
    as fake 'alternatives' that aren't actually different."""
    s1 = make_stop("S1", "Ratnapark", 27.7050, 85.3145)
    s2 = make_stop("S2", "Sundhara", 27.7010, 85.3130)
    s3 = make_stop("S3", "Tripureshwor", 27.6950, 85.3120)
    route_a = make_route("R_A", [s1, s2, s3])

    s4 = make_stop("S4", "Koteshwor", 27.6780, 85.3480)
    s5 = make_stop("S5", "Sundhara West", 27.70104, 85.31305)  # ~6m from S2
    s6 = make_stop("S6", "Kalanki", 27.6935, 85.2800)
    route_b = make_route("R_B", [s4, s5, s6])

    monkeypatch.setattr(gb, "get_active_routes", lambda session: [route_a, route_b])

    result = find_shortest_path(
        session=None,
        origin_stop_id="S1",
        destination_stop_id="S6",
        include_alternatives=True,
    )
    assert result.stop_sequence == ["S1", "S2", "S5", "S6"]
    assert result.alternatives == []
