"""Data shapes used by the graph engine."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Stop:
    stop_id: int
    name: str
    lat: float
    lng: float


@dataclass(frozen=True)
class RouteStop:
    route_id: int
    stop_id: int
    sequence_order: int
