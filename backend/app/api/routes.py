"""
api/routes.py

GET /routes/{route_id}         — route detail, with its ordered stops
GET /routes/{route_id}/stops   — just the ordered stop list for a route
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import queries
from app.db.session import get_db
from app.schemas import RouteDetailOut, RouteStopsOut

router = APIRouter(tags=["routes"])


@router.get("/routes/{route_id}", response_model=RouteDetailOut)
def get_route(route_id: str, db: Session = Depends(get_db)):
    route = queries.get_route(db, route_id)
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found")
    return route


@router.get("/routes/{route_id}/stops", response_model=RouteStopsOut)
def get_route_stops(route_id: str, db: Session = Depends(get_db)):
    route = queries.get_route(db, route_id)
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route '{route_id}' not found")

    stops = queries.get_route_stops_ordered(db, route_id)
    return RouteStopsOut(route_id=route_id, stops=stops)