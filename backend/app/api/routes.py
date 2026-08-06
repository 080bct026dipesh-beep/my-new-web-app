"""The main "find me a bus" endpoint.

Wires the graph engine (app/graph_engine, DB-agnostic and already
tested in isolation) to the database: load the graph, run Dijkstra,
walk the resulting path and group it into legs a rider can actually
follow ("ride route 14 from A to B, then transfer, then ride route 22").
"""

from geoalchemy2.shape import to_shape
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db.graph_loader import get_graph
from app.db.session import get_db
from app.graph_engine.graph_builder import EDGE_TYPE_TRANSFER
from app.graph_engine.route_finder import NoRouteFoundError, RouteFinder
from app.models import Route as RouteORM
from app.models import Stop as StopORM

from .schemas import RouteLeg, RouteSearchResult, StopOut

router = APIRouter()


def _stop_out(row: StopORM) -> StopOut:
    point = to_shape(row.geom)
    return StopOut(
        stop_id=row.stop_id,
        name=row.name,
        lat=point.y,
        lng=point.x,
        is_interchange=row.is_interchange,
        verified=row.verified,
    )


def _build_legs(db: Session, graph, path: list[int]) -> list[RouteLeg]:
    """Collapse a stop-id path into legs: consecutive edges of the
    same kind (same route_id, or a transfer) become one leg.
    """
    stops_by_id = {s.stop_id: s for s in db.query(StopORM).filter(StopORM.stop_id.in_(path)).all()}
    route_names: dict[int, RouteORM] = {r.route_id: r for r in db.query(RouteORM).all()}

    legs: list[RouteLeg] = []
    current_stop_ids: list[int] = [path[0]]
    current_kind: str | None = None
    current_route_id: int | None = None
    current_distance = 0.0

    def flush() -> None:
        if len(current_stop_ids) < 2:
            return
        route = route_names.get(current_route_id) if current_route_id is not None else None
        legs.append(
            RouteLeg(
                kind=current_kind,
                route_id=current_route_id,
                route_number=route.route_number if route else None,
                route_name=route.route_name if route else None,
                stops=[_stop_out(stops_by_id[sid]) for sid in current_stop_ids],
                distance_m=current_distance,
            )
        )

    for a, b in zip(path, path[1:]):
        edge = graph.edges[a, b]
        edge_type = edge.get("edge_type")
        kind = "transfer" if edge_type == EDGE_TYPE_TRANSFER else "ride"
        route_id = edge.get("route_id")

        same_leg = current_kind == kind and (kind == "transfer" or route_id == current_route_id)
        if current_kind is not None and not same_leg:
            flush()
            current_stop_ids = [a]
            current_distance = 0.0

        current_kind = kind
        current_route_id = route_id
        current_stop_ids.append(b)
        current_distance += edge.get("weight", 0.0)

    flush()
    return legs


@router.get("/find", response_model=RouteSearchResult)
def find_route(
    origin_stop_id: int = Query(...),
    destination_stop_id: int = Query(...),
    db: Session = Depends(get_db),
) -> RouteSearchResult:
    graph = get_graph(db)
    finder = RouteFinder(graph)

    try:
        result = finder.find_route(origin_stop_id, destination_stop_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except NoRouteFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    stops_by_id = {s.stop_id: s for s in db.query(StopORM).filter(StopORM.stop_id.in_(result.stop_ids)).all()}
    missing = [sid for sid in (origin_stop_id, destination_stop_id) if sid not in stops_by_id]
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Unknown stop id(s): {missing}")

    legs = _build_legs(db, graph, result.stop_ids)

    return RouteSearchResult(
        origin=_stop_out(stops_by_id[origin_stop_id]),
        destination=_stop_out(stops_by_id[destination_stop_id]),
        is_transfer=result.is_transfer,
        transfer_stop=_stop_out(stops_by_id[result.transfer_stop_id]) if result.transfer_stop_id else None,
        total_distance_m=result.total_weight,
        legs=legs,
        path=[_stop_out(stops_by_id[sid]) for sid in result.stop_ids],
    )
