"""
Pure logic tests for the routing graph pathfinder — no live DB needed since
these build a small synthetic graph shaped like graph_builder.build_graph()
would produce it.
"""

import networkx as nx
import pytest

from app.routing.pathfinder import path_to_legs, shortest_path, total_cost, transfer_count


@pytest.fixture
def graph():
    """
    S1 --R1(300)--> S2 --R1(400)--> S3 --R2(500)--> S4
    S1 --R3(5000)--> S9 --R3(5000)--> S4   (much longer decoy path)
    """
    G = nx.DiGraph()
    G.add_edge("S1", "S2", weight=300, route_id="R1", route_name="Route 1")
    G.add_edge("S2", "S3", weight=400, route_id="R1", route_name="Route 1")
    G.add_edge("S3", "S4", weight=500, route_id="R2", route_name="Route 2")
    G.add_edge("S1", "S9", weight=5000, route_id="R3", route_name="Route 3")
    G.add_edge("S9", "S4", weight=5000, route_id="R3", route_name="Route 3")
    return G


def test_shortest_path_prefers_cheaper_route_over_direct_decoy(graph):
    assert shortest_path(graph, "S1", "S4") == ["S1", "S2", "S3", "S4"]


def test_shortest_path_returns_none_for_unknown_node(graph):
    assert shortest_path(graph, "S1", "S999") is None


def test_shortest_path_returns_none_when_unreachable(graph):
    graph.add_node("ISLAND")
    assert shortest_path(graph, "S1", "ISLAND") is None


def test_total_cost_sums_edge_weights(graph):
    path = shortest_path(graph, "S1", "S4")
    assert total_cost(graph, path) == 1200


def test_path_to_legs_splits_on_route_change(graph):
    path = shortest_path(graph, "S1", "S4")
    legs = path_to_legs(graph, path)

    assert len(legs) == 2
    assert legs[0] == {
        "route_id": "R1",
        "route_name": "Route 1",
        "board_stop_id": "S1",
        "alight_stop_id": "S3",
        "num_stops": 2,
    }
    assert legs[1] == {
        "route_id": "R2",
        "route_name": "Route 2",
        "board_stop_id": "S3",
        "alight_stop_id": "S4",
        "num_stops": 1,
    }


def test_path_to_legs_single_route_is_one_leg(graph):
    path = shortest_path(graph, "S1", "S3")
    legs = path_to_legs(graph, path)
    assert len(legs) == 1
    assert legs[0]["route_id"] == "R1"
    assert legs[0]["num_stops"] == 2


def test_path_to_legs_empty_path_is_no_legs(graph):
    assert path_to_legs(graph, []) == []
    assert path_to_legs(graph, ["S1"]) == []


def test_transfer_count_matches_leg_boundaries(graph):
    path = shortest_path(graph, "S1", "S4")
    legs = path_to_legs(graph, path)
    assert transfer_count(legs) == 1

    direct_path = shortest_path(graph, "S1", "S3")
    direct_legs = path_to_legs(graph, direct_path)
    assert transfer_count(direct_legs) == 0