from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session


from app.db.session import get_db
from app.db import queries
from app.schemas import RouteListOut, RouteOut, RouteStopOut

router = APIRouter(prefix="/routes", tags=["routes"])


@router.get("", response_model=RouteListOut)
def list_routes(
    q: str | None = Query(None, description="Optional case-insensitive substring match on route_name"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """Route browser listing -- lean (no stops payload); pair with
    GET /routes/{route_id}/stops to fetch a single route's ordered stops
    once the user picks one, rather than shipping every route's full stop
    list up front."""
    items = queries.list_routes(db, q=q, limit=limit, offset=offset)
    total = queries.count_routes(db, q=q)
    return RouteListOut(total=total, limit=limit, offset=offset, items=items)


@router.get("/{route_id}", response_model=RouteOut)
def read_route(route_id: str, db: Session = Depends(get_db)):
    route = queries.get_route(db, route_id)
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found")
    return route


@router.get("/{route_id}/stops", response_model=list[RouteStopOut])
def read_route_stops(route_id: str, db: Session = Depends(get_db)):
    if queries.get_route(db, route_id) is None:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found")
    return queries.get_route_stops(db, route_id)