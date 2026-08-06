"""
schemas.py

Pydantic response models for the API layer. Kept separate from the
SQLAlchemy models in models/ — these define what the API returns, not
what the DB stores (e.g. no created_at/updated_at noise on read endpoints).
"""

from pydantic import BaseModel, ConfigDict


class StopOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stop_id: str
    stop_name: str
    lat: float
    lng: float
    zone: str | None = None
    district: str | None = None
    is_major_stop: bool
    is_interchange: bool
    status: str


class StopListOut(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[StopOut]


class RouteStopOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sequence_no: int
    stop: StopOut


class RouteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    route_id: str
    route_name: str
    short_name: str | None = None
    vehicle_type: str
    operator: str | None = None
    start_stop_id: str
    end_stop_id: str
    total_stops: int
    approx_distance_km: float | None = None
    is_bidirectional: bool
    status: str


class RouteDetailOut(RouteOut):
    route_stops: list[RouteStopOut]


class RouteStopsOut(BaseModel):
    route_id: str
    stops: list[RouteStopOut]


class RouteFinderSegmentOut(BaseModel):
    route_id: str | None  # None => walking transfer between stops
    is_transfer: bool
    distance_m: float
    from_stop: StopOut
    to_stop: StopOut


class RouteFinderResponse(BaseModel):
    origin_stop_id: str
    destination_stop_id: str
    total_distance_m: float
    transfer_count: int
    stop_sequence: list[str]
    segments: list[RouteFinderSegmentOut]