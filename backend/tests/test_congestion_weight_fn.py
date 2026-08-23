"""
tests/test_congestion_weight_fn.py

Unit tests for pathfinder._congestion_weight_fn -- the per-request edge
weight function that combines the organic congestion_lookup (real ride
samples, see app/db/queries.get_congestion_ratios) with the static
geographic congestion_zones via max(), not addition (see the function's
own docstring and congestion_zones.py's module docstring for why).

Testing a private (_-prefixed) function directly here is deliberate:
this is the one piece of new logic the congestion-zones patch actually
added, and it's cheap to get subtly wrong (e.g. summing instead of
taking the max, or checking `if congestion_lookup` instead of
`is not None` and silently disabling itself on an empty-but-real
lookup). None of the existing test_pathfinder_alternatives.py tests
exercise avoid_congestion at all, so this closes that gap directly
rather than via a harder-to-diagnose full find_shortest_path scenario.
"""
import networkx as nx
import pytest

from app.routing import congestion_zones as cz
from app.routing.constants import CONGESTION_LAMBDA
from app.routing.pathfinder import _congestion_weight_fn


def _ride_edge(distance_m, route_id="R1"):
    return {"kind": "ride", "distance_m": distance_m, "weight": distance_m, "route_id": route_id}


def _make_graph(a_latlng, b_latlng):
    graph = nx.DiGraph()
    graph.add_node("A", lat=a_latlng[0], lng=a_latlng[1])
    graph.add_node("B", lat=b_latlng[0], lng=b_latlng[1])
    return graph


FAR_AWAY = (27.9000, 85.6000)  # outside every zone used in these tests


@pytest.fixture(autouse=True)
def _reset_cache():
    cz.reset_zones_cache()
    yield
    cz.reset_zones_cache()


def test_non_ride_edges_are_never_reweighted(monkeypatch):
    """board/alight/walk edges must pass through unchanged regardless of
    congestion -- only "ride" edges are ever inflated."""
    monkeypatch.setattr(cz, "load_zones", lambda: [])
    graph = _make_graph((27.70, 85.31), FAR_AWAY)
    weight = _congestion_weight_fn(graph, {("R1", "A", "B"): 4.0})

    for kind in ("board", "alight", "walk"):
        edge = {"kind": kind, "distance_m": 500, "weight": 500}
        assert weight("A", "B", edge) == 500


def test_ratio_at_or_below_one_leaves_ride_edge_unchanged(monkeypatch):
    monkeypatch.setattr(cz, "load_zones", lambda: [])
    graph = _make_graph((27.70, 85.31), FAR_AWAY)
    weight = _congestion_weight_fn(graph, {("R1", "A", "B"): 1.0})
    assert weight("A", "B", _ride_edge(500)) == 500


def test_organic_ratio_inflates_when_no_zones_present(monkeypatch):
    monkeypatch.setattr(cz, "load_zones", lambda: [])
    graph = _make_graph((27.70, 85.31), FAR_AWAY)
    weight = _congestion_weight_fn(graph, {("R1", "A", "B"): 2.0})

    expected = 500 * (1 + CONGESTION_LAMBDA * (2.0 - 1))
    assert weight("A", "B", _ride_edge(500)) == pytest.approx(expected)


def test_zone_ratio_inflates_even_with_no_organic_data(monkeypatch):
    """An edge with zero ride history (empty congestion_lookup) still
    gets penalized if it physically sits inside a congestion zone --
    that's the entire point of having a static, geography-based signal
    independent of accumulated organic samples."""
    zone = cz.CongestionZone(stop_id="Z", name="Zone", lat=27.70, lng=85.31, radius_m=300, ratio=3.0)
    monkeypatch.setattr(cz, "load_zones", lambda: [zone])

    graph = _make_graph((27.70, 85.31), FAR_AWAY)  # node A sits inside the zone
    weight = _congestion_weight_fn(graph, {})

    expected = 500 * (1 + CONGESTION_LAMBDA * (3.0 - 1))
    assert weight("A", "B", _ride_edge(500)) == pytest.approx(expected)


def test_worse_signal_wins_zone_beats_organic(monkeypatch):
    """max(), not addition: a strong zone ratio should win outright over
    a weak organic ratio, not stack with it."""
    zone = cz.CongestionZone(stop_id="Z", name="Zone", lat=27.70, lng=85.31, radius_m=300, ratio=4.0)
    monkeypatch.setattr(cz, "load_zones", lambda: [zone])

    graph = _make_graph((27.70, 85.31), FAR_AWAY)
    weight = _congestion_weight_fn(graph, {("R1", "A", "B"): 1.2})

    expected = 500 * (1 + CONGESTION_LAMBDA * (4.0 - 1))  # zone (4.0) beats organic (1.2)
    assert weight("A", "B", _ride_edge(500)) == pytest.approx(expected)


def test_worse_signal_wins_organic_beats_zone(monkeypatch):
    """Same as above, mirrored: a strong organic ratio should win over a
    weak (or absent) zone signal."""
    zone = cz.CongestionZone(stop_id="Z", name="Zone", lat=27.70, lng=85.31, radius_m=300, ratio=1.3)
    monkeypatch.setattr(cz, "load_zones", lambda: [zone])

    graph = _make_graph((27.70, 85.31), FAR_AWAY)
    weight = _congestion_weight_fn(graph, {("R1", "A", "B"): 5.0})

    expected = 500 * (1 + CONGESTION_LAMBDA * (5.0 - 1))  # organic (5.0) beats zone (1.3)
    assert weight("A", "B", _ride_edge(500)) == pytest.approx(expected)


def test_zone_check_uses_either_endpoint(monkeypatch):
    """A ride edge should be penalized if EITHER endpoint falls inside a
    zone -- not just the origin. Here only node B is inside the zone."""
    zone = cz.CongestionZone(stop_id="Z", name="Zone", lat=27.70, lng=85.31, radius_m=300, ratio=3.5)
    monkeypatch.setattr(cz, "load_zones", lambda: [zone])

    graph = _make_graph(FAR_AWAY, (27.70, 85.31))  # node A far away, node B inside the zone
    weight = _congestion_weight_fn(graph, {})

    expected = 500 * (1 + CONGESTION_LAMBDA * (3.5 - 1))
    assert weight("A", "B", _ride_edge(500)) == pytest.approx(expected)


def test_no_zones_and_no_organic_data_is_free_flow(monkeypatch):
    monkeypatch.setattr(cz, "load_zones", lambda: [])
    graph = _make_graph((27.70, 85.31), FAR_AWAY)
    weight = _congestion_weight_fn(graph, {})
    assert weight("A", "B", _ride_edge(500)) == 500
