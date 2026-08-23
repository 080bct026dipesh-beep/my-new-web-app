"""
api/fare.py

GET /fare — distance-banded fare lookup. The underlying fare_rules table
and queries.fare_for_distance() already existed; this is the first
endpoint to expose either.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db import queries
from app.schemas import FareOut

router = APIRouter(tags=["fare"])


@router.get("/fare", response_model=FareOut)
def get_fare(
    distance_km: float = Query(..., ge=0, description="Trip distance in kilometers"),
    db: Session = Depends(get_db),
):
    fare = queries.fare_for_distance(db, distance_km)
    if fare is None:
        raise HTTPException(
            status_code=404,
            detail=f"No fare band covers a {distance_km} km trip.",
        )
    return fare
