"""
models.py

Plain dataclasses -- deliberately NOT SQLAlchemy ORM models. This is
what keeps graph_engine/ independent of app/db and app/models: it only
needs to know these two shapes, and doesn't care whether they came
from a database, a CSV, or hand-typed sample data.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Stop:
    stop_id: int
    name: str
    lat: float
    lng: float


@dataclass(frozen=True)
class RouteStop:
    """One row of a route's ordered stop sequence -- which stop, on
    which route, at what position."""
    route_id: int
    stop_id: int
    sequence_order: int
    