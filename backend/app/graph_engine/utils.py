"""
utils.py

Reusable helper functions. Currently: distance between two points on
Earth's surface, used as the edge-weight basis throughout the graph
engine (a stand-in for real travel time, since no timetable data
exists yet -- document this simplification in your report).
"""
import math

from constants import EARTH_RADIUS


def haversine_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two lat/lng points, in meters."""
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return EARTH_RADIUS * c

