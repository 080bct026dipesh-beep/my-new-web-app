import math

import networkx as nx

from app.routing.graph_builder import _add_or_relax_edge, _haversine_m


class _FakeRoute:
    def __init__(self, route_id, route_name):
        self.route_id = route_id
        self.route_name = route_name


def test_haversine_zero_distance_for_same_point():
    assert _haversine_m(27.7, 85.3, 27.7, 85.3) == 0


def test_haversine_known_distance_ratnapark_to_koteshwor():
    dist = _haversine_m(27.7040, 85.3145, 27.6789, 85.3470)
    assert 4000 < dist < 7000


def test_add_or_relax_edge_creates_new_edge():
    G = nx.DiGraph()
    route = _FakeRoute("R1", "Route 1")
    _add_or_relax_edge(G, "A", "B", 500, route)
    assert G["A"]["B"]["weight"] == 500
    assert G["A"]["B"]["route_id"] == "R1"


def test_add_or_relax_edge_keeps_cheaper_of_two_routes():
    G = nx.DiGraph()
    slow_route = _FakeRoute("R1", "Slow route")
    fast_route = _FakeRoute("R2", "Fast route")

    _add_or_relax_edge(G, "A", "B", 900, slow_route)
    _add_or_relax_edge(G, "A", "B", 400, fast_route)

    assert G["A"]["B"]["weight"] == 400
    assert G["A"]["B"]["route_id"] == "R2"


def test_add_or_relax_edge_ignores_more_expensive_route():
    G = nx.DiGraph()
    fast_route = _FakeRoute("R2", "Fast route")
    slow_route = _FakeRoute("R1", "Slow route")

    _add_or_relax_edge(G, "A", "B", 400, fast_route)
    _add_or_relax_edge(G, "A", "B", 900, slow_route)

    assert G["A"]["B"]["weight"] == 400
    assert G["A"]["B"]["route_id"] == "R2"