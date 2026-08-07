from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy.orm import Session
from fastapi import Depends

from app.db.session import get_db
from app.db import queries
from app.routing.pathfinder import path_to_legs, shortest_path, total_cost, transfer_count
from app.schemas import RouteFinderResult, RouteLeg, StopOut

router = APIRouter(tags=["route-finder"])


@router.get("/route-finder", response_model=RouteFinderResult)
def find_route(
    request: Request,
    origin: str = Query(..., description="Origin stop_id, e.g. S0198"),
    destination: str = Query(..., description="Destination stop_id, e.g. S0021"),
    db: Session = Depends(get_db),
):
    G = getattr(request.app.state, "graph", None)
    if G is None:
        raise HTTPException(status_code=503, detail="Routing graph is not ready yet")

    if origin not in G:
        raise HTTPException(status_code=404, detail=f"Origin stop '{origin}' not found in routing graph")
    if destination not in G:
        raise HTTPException(status_code=404, detail=f"Destination stop '{destination}' not found in routing graph")

    path = shortest_path(G, origin, destination)
    if path is None:
        raise HTTPException(
            status_code=404,
            detail=f"No route found between '{origin}' and '{destination}'",
        )

    raw_legs = path_to_legs(G, path)

    legs: list[RouteLeg] = []
    for raw_leg in raw_legs:
        board_stop = queries.get_stop(db, raw_leg["board_stop_id"])
        alight_stop = queries.get_stop(db, raw_leg["alight_stop_id"])
        if board_stop is None or alight_stop is None:
            raise HTTPException(
                status_code=409,
                detail="Routing graph is stale relative to the database — rebuild it and retry",
            )
        legs.append(
            RouteLeg(
                route_id=raw_leg["route_id"],
                route_name=raw_leg["route_name"],
                board_stop=StopOut.model_validate(board_stop),
                alight_stop=StopOut.model_validate(alight_stop),
                num_stops=raw_leg["num_stops"],
            )
        )

    return RouteFinderResult(
        origin_stop_id=origin,
        destination_stop_id=destination,
        total_cost=total_cost(G, path),
        transfer_count=transfer_count(raw_legs),
        legs=legs,
    )