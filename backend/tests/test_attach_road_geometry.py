"""Regression tests for _attach_road_geometry's bearing/radius-constrained
-> unconstrained fallback (see app/api/routing.py). This is what fixes the
"some legs on this route show a straight line, others show real road
geometry" symptom: the constrained (bearing+radius) OSRM request can fail
for a leg even when an unconstrained request for the same coordinates
would succeed, and previously that just silently fell back to a straight
line with no retry."""

import os

# app.api.routing imports app.db.session, which validates required
# Settings fields at import time (admin_api_key, jwt_secret_key). Set
# harmless test values before the import below so this file -- like
# every other test file that doesn't need a real DB -- can still run
# without a .env.
os.environ.setdefault("ADMIN_API_KEY", "test-admin-key")
os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret")

import pytest

from app.api import routing
from app.routing.osrm_client import OSRMError
from app.schemas import RouteLeg, StopOut


def make_stop(stop_id: str, lat: float, lng: float) -> StopOut:
    return StopOut(
        stop_id=stop_id,
        stop_name=stop_id,
        lat=lat,
        lng=lng,
        is_major_stop=False,
        is_interchange=False,
        status="active",
    )


def make_leg(route_id: str, stops: list[StopOut]) -> RouteLeg:
    return RouteLeg(
        route_id=route_id,
        route_name=route_id,
        board_stop=stops[0],
        alight_stop=stops[-1],
        num_ride_segments=len(stops) - 1,
        stops=stops,
    )


def test_falls_back_to_unconstrained_request_when_constrained_fails(monkeypatch):
    s1 = make_stop("S1", 27.7000, 85.3100)
    s2 = make_stop("S2", 27.7010, 85.3110)
    leg = make_leg("R1", [s1, s2])

    calls = []

    def fake_get_route_geometry(coords, profile="driving", bearings=None, radiuses=None):
        calls.append({"bearings": bearings, "radiuses": radiuses})
        if bearings is not None or radiuses is not None:
            # Simulate the constrained (bearing+radius) request failing --
            # e.g. no bearing-matching edge within the snap radius.
            raise OSRMError("NoSegment")
        return {"geometry": {"type": "LineString", "coordinates": [[85.31, 27.70], [85.311, 27.701]]},
                "distance_m": 150.0, "duration_s": 45.0}

    monkeypatch.setattr(routing, "get_route_geometry", fake_get_route_geometry)

    routing._attach_road_geometry([leg])

    assert leg.road_geometry is not None
    assert leg.road_geometry["distance_m"] == 150.0
    # First call was constrained, second (successful) call was unconstrained.
    assert len(calls) == 2
    assert calls[0]["bearings"] is not None
    assert calls[1]["bearings"] is None and calls[1]["radiuses"] is None


def test_falls_back_to_straight_line_when_both_attempts_fail(monkeypatch):
    s1 = make_stop("S1", 27.7000, 85.3100)
    s2 = make_stop("S2", 27.7010, 85.3110)
    leg = make_leg("R1", [s1, s2])

    def always_fails(coords, profile="driving", bearings=None, radiuses=None):
        raise OSRMError("NoRoute")

    monkeypatch.setattr(routing, "get_route_geometry", always_fails)

    # Should not raise -- both attempts fail, leg.road_geometry stays None
    # and BusMap.tsx/RouteResultPanel.tsx fall back to a straight line.
    routing._attach_road_geometry([leg])
    assert leg.road_geometry is None


def test_no_retry_needed_when_constrained_request_succeeds(monkeypatch):
    s1 = make_stop("S1", 27.7000, 85.3100)
    s2 = make_stop("S2", 27.7010, 85.3110)
    leg = make_leg("R1", [s1, s2])

    calls = []

    def fake_get_route_geometry(coords, profile="driving", bearings=None, radiuses=None):
        calls.append(1)
        return {"geometry": {"type": "LineString", "coordinates": []}, "distance_m": 200.0, "duration_s": 60.0}

    monkeypatch.setattr(routing, "get_route_geometry", fake_get_route_geometry)

    routing._attach_road_geometry([leg])

    assert leg.road_geometry["distance_m"] == 200.0
    assert len(calls) == 1  # no wasted unconstrained retry when the first call already worked
