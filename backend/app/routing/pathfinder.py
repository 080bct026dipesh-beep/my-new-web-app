"""
routing/pathfinder.py

Shortest-path route finding on top of the graph from graph_builder.py.
Verify with a known route before wiring this up to an API endpoint, e.g.:

    from app.db.session import SessionLocal
    from app.routing.pathfinder import find_shortest_path
    db = SessionLocal()
    result = find_shortest_path(db, "S0198", "S0021")
    print(result.stop_sequence)

Compare stop_sequence / transfer_count against a route you know by hand
before trusting this for GET /route-finder.
"""

from dataclasses import dataclass

import networkx as nx
from sqlalchemy.orm import Session

from app.routing.graph_builder import get_cached_graph


class NoRouteFoundError(Exception):
    """Raised when either stop_id is unknown to the graph, or no path exists."""


@dataclass
class RouteSegment:
    from_stop_id: str
    to_stop_id: str
    route_id: str | None
    is_transfer: bool
    distance_m: float


@dataclass
class RouteFinderResult:
    stop_sequence: list[str]
    segments: list[RouteSegment]
    total_distance_m: float
    transfer_count: int


def find_shortest_path(
    session: Session, origin_stop_id: str, destination_stop_id: str
) -> RouteFinderResult:
    graph = get_cached_graph(session)

    if origin_stop_id not in graph:
        raise NoRouteFoundError(f"Unknown origin stop_id: {origin_stop_id}")
    if destination_stop_id not in graph:
        raise NoRouteFoundError(f"Unknown destination stop_id: {destination_stop_id}")

    try:
        path = nx.shortest_path(
            graph, source=origin_stop_id, target=destination_stop_id, weight="weight"
        )
    except nx.NetworkXNoPath as exc:
        raise NoRouteFoundError(
            f"No route between {origin_stop_id} and {destination_stop_id}"
        ) from exc

    segments: list[RouteSegment] = []
    total_distance = 0.0
    transfer_count = 0

    for a, b in zip(path, path[1:]):
        edge = graph[a][b]
        is_transfer = edge.get("is_transfer", False)
        segments.append(
            RouteSegment(
                from_stop_id=a,
                to_stop_id=b,
                route_id=edge.get("route_id"),
                is_transfer=is_transfer,
                distance_m=edge["weight"],
            )
        )
        total_distance += edge["weight"]
        if is_transfer:
            transfer_count += 1

    return RouteFinderResult(
        stop_sequence=path,
        segments=segments,
        total_distance_m=total_distance,
        transfer_count=transfer_count,
    )