"""
Graph construction.

Builds a single weighted, directed NetworkX graph:
  - nodes: stop_id
  - route edges: consecutive stops on the same route, weight = distance (m)
  - transfer edges: between stops on DIFFERENT routes that are physically
    close to each other (same real-world location), weight = distance
    between them + TRANSFER_PENALTY_M

One graph, two edge types, one Dijkstra call later handles both direct
and single-transfer queries -- that's the whole trick.
"""
from collections import defaultdict
from itertools import combinations

import networkx as nx

from models import RouteStop, Stop
from utils import haversine_distance
from constants import TRANSFER_PENALTY, INTERCHANGE_DISTANCE


def build_graph(
    stops: list[Stop],
    route_stops: list[RouteStop],
) -> nx.DiGraph:
    graph = nx.DiGraph()

    stops_by_id = {s.stop_id: s for s in stops}
    for stop in stops:
        graph.add_node(stop.stop_id, name=stop.name, lat=stop.lat, lng=stop.lng)

    _add_route_edges(graph, stops_by_id, route_stops)
    _add_transfer_edges(graph, stops_by_id, route_stops)

    return graph


def _add_route_edges(graph, stops_by_id, route_stops: list[RouteStop]) -> None:
    """Connect consecutive stops within each route, both directions
    (buses run in both directions along a corridor unless you have
    explicit directionality data -- adjust if you do)."""
    by_route: dict[int, list[RouteStop]] = defaultdict(list)
    for rs in route_stops:
        by_route[rs.route_id].append(rs)

    for route_id, stops_in_route in by_route.items():
        stops_in_route.sort(key=lambda rs: rs.sequence_order)
        for a, b in zip(stops_in_route, stops_in_route[1:]):
            stop_a, stop_b = stops_by_id[a.stop_id], stops_by_id[b.stop_id]
            dist = haversine_distance(stop_a.lat, stop_a.lng, stop_b.lat, stop_b.lng)
            graph.add_edge(a.stop_id, b.stop_id, weight=dist, edge_type="route", route_id=route_id)
            graph.add_edge(b.stop_id, a.stop_id, weight=dist, edge_type="route", route_id=route_id)


def _add_transfer_edges(graph, stops_by_id, route_stops: list[RouteStop]) -> None:
    """Find stops on different routes that are geographically close and
    add a penalized bidirectional edge between them."""
    stop_to_routes: dict[int, set[int]] = defaultdict(set)
    for rs in route_stops:
        stop_to_routes[rs.stop_id].add(rs.route_id)

    stop_ids = list(stop_to_routes.keys())
    for id_a, id_b in combinations(stop_ids, 2):
        # Skip if they already share a route -- no transfer needed there.
        if stop_to_routes[id_a] & stop_to_routes[id_b]:
            continue

        stop_a, stop_b = stops_by_id[id_a], stops_by_id[id_b]
        dist = haversine_distance(stop_a.lat, stop_a.lng, stop_b.lat, stop_b.lng)

        if dist <= INTERCHANGE_DISTANCE:
            weight = dist + TRANSFER_PENALTY
            graph.add_edge(id_a, id_b, weight=weight, edge_type="transfer")
            graph.add_edge(id_b, id_a, weight=weight, edge_type="transfer")
            
