"""
Shortest-path search over the routing graph built by graph_builder, plus the
logic to turn a raw stop_id path into ride-by-ride legs.

Example (manual verification, once the graph is built against a live DB):

    >>> G = build_graph(session)
    >>> nx.shortest_path(G, source="S0198", target="S0021", weight="weight")

Compare that against a route you know by hand before trusting the
/route-finder endpoint.
"""

from typing import Optional, TypedDict

import networkx as nx


class Leg(TypedDict):
    route_id: str
    route_name: str
    board_stop_id: str
    alight_stop_id: str
    num_stops: int


def shortest_path(G: nx.DiGraph, source: str, target: str) -> Optional[list[str]]:
    """List of stop_ids from source to target (inclusive), or None if either
    stop isn't in the graph or no path exists."""
    try:
        return nx.shortest_path(G, source=source, target=target, weight="weight")
    except (nx.NodeNotFound, nx.NetworkXNoPath):
        return None


def total_cost(G: nx.DiGraph, path: list[str]) -> float:
    """Sum of edge weights (meters) along the path -- what shortest_path
    actually optimized for."""
    return sum(G[u][v]["weight"] for u, v in zip(path, path[1:]))


def path_to_legs(G: nx.DiGraph, path: list[str]) -> list[Leg]:
    """Collapse a stop_id path into legs. A leg is a maximal run of
    consecutive edges sharing the same route_id -- switching route_id
    mid-path is a transfer."""
    if not path or len(path) < 2:
        return []

    legs: list[Leg] = []
    board_stop = path[0]
    current_route_id: Optional[str] = None
    current_route_name: Optional[str] = None
    num_stops = 0

    for u, v in zip(path, path[1:]):
        edge = G.get_edge_data(u, v)
        route_id = edge["route_id"]

        if current_route_id is None:
            current_route_id = route_id
            current_route_name = edge["route_name"]
        elif route_id != current_route_id:
            legs.append(
                Leg(
                    route_id=current_route_id,
                    route_name=current_route_name,
                    board_stop_id=board_stop,
                    alight_stop_id=u,
                    num_stops=num_stops,
                )
            )
            board_stop = u
            current_route_id = route_id
            current_route_name = edge["route_name"]
            num_stops = 0

        num_stops += 1

    legs.append(
        Leg(
            route_id=current_route_id,
            route_name=current_route_name,
            board_stop_id=board_stop,
            alight_stop_id=path[-1],
            num_stops=num_stops,
        )
    )
    return legs


def transfer_count(legs: list[Leg]) -> int:
    return max(len(legs) - 1, 0)