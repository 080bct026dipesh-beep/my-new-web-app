"""
API-level tests for POST /stops, POST /routes, and POST /routes/{id}/stops
(app/api/admin.py) -- require a live Postgres/PostGIS instance
(docker compose up -d db) with migration 0002 applied. Skip cleanly if no
DB is reachable.

Fully self-contained: every stop/route this file creates is deleted in a
fixture teardown, so it never depends on (or pollutes) the shipped dataset.
"""
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import Settings
from app.db.session import SessionLocal
from app.models import Route, RouteStop, Stop

ADMIN_API_KEY = Settings().admin_api_key
BAD_ADMIN_API_KEY = "definitely-not-the-real-key"


@pytest.fixture
def client():
    session = SessionLocal()
    try:
        session.execute(text("SELECT 1"))
    except OperationalError:
        pytest.skip("No live database available — run `docker compose up -d db` first")
    finally:
        session.close()
    return TestClient(app)


def _admin_headers():
    return {"X-Admin-Api-Key": ADMIN_API_KEY}


@pytest.fixture
def two_stops(client):
    """Two throwaway stops via the real create_stop endpoint (also covers
    next_stop_id's S#### generation), deleted afterward."""
    created_ids = []
    for suffix in ("start", "end"):
        resp = client.post(
            "/stops",
            json={
                "stop_name": f"Test Stop {suffix} {uuid.uuid4().hex[:6]}",
                "lat": 27.7,
                "lng": 85.3,
            },
            headers=_admin_headers(),
        )
        assert resp.status_code == 201, resp.text
        created_ids.append(resp.json()["stop_id"])

    try:
        yield tuple(created_ids)
    finally:
        session = SessionLocal()
        # Delete any route_stops referencing these first (RESTRICT FK).
        session.execute(text("DELETE FROM route_stops WHERE stop_id = ANY(:ids)"), {"ids": created_ids})
        session.execute(text("DELETE FROM routes WHERE start_stop_id = ANY(:ids) OR end_stop_id = ANY(:ids)"), {"ids": created_ids})
        session.execute(text("DELETE FROM stops WHERE stop_id = ANY(:ids)"), {"ids": created_ids})
        session.commit()
        session.close()


# --- POST /stops -----------------------------------------------------------


def test_create_stop_requires_admin_key(client):
    resp = client.post("/stops", json={"stop_name": "No Auth Stop", "lat": 27.7, "lng": 85.3})
    assert resp.status_code in (401, 403, 422)


def test_create_stop_rejects_wrong_admin_key(client):
    resp = client.post(
        "/stops",
        json={"stop_name": "Wrong Key Stop", "lat": 27.7, "lng": 85.3},
        headers={"X-Admin-Api-Key": BAD_ADMIN_API_KEY},
    )
    assert resp.status_code == 401


def test_create_stop_succeeds_and_assigns_sequential_id(client):
    name = f"Test Stop {uuid.uuid4().hex[:6]}"
    resp = client.post(
        "/stops", json={"stop_name": name, "lat": 27.71, "lng": 85.32}, headers=_admin_headers()
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["stop_name"] == name
    assert body["stop_id"].startswith("S")

    session = SessionLocal()
    try:
        row = session.get(Stop, body["stop_id"])
        assert row is not None
        assert float(row.lat) == 27.71
    finally:
        session.execute(text("DELETE FROM stops WHERE stop_id = :sid"), {"sid": body["stop_id"]})
        session.commit()
        session.close()


def test_create_stop_rejects_out_of_range_latitude(client):
    resp = client.post(
        "/stops",
        json={"stop_name": "Bad Lat Stop", "lat": 999, "lng": 85.3},
        headers=_admin_headers(),
    )
    assert resp.status_code == 422


def test_create_stop_rejects_empty_name(client):
    resp = client.post(
        "/stops", json={"stop_name": "   ", "lat": 27.7, "lng": 85.3}, headers=_admin_headers()
    )
    assert resp.status_code == 422


# --- POST /routes -----------------------------------------------------------


def test_create_route_requires_admin_key(client, two_stops):
    start, end = two_stops
    resp = client.post(
        "/routes",
        json={
            "route_name": "No Auth Route",
            "vehicle_type": "bus",
            "start_stop_id": start,
            "end_stop_id": end,
            "total_stops": 2,
        },
    )
    assert resp.status_code in (401, 403, 422)


def test_create_route_succeeds_with_valid_stops(client, two_stops):
    start, end = two_stops
    name = f"Test Route {uuid.uuid4().hex[:6]}"
    resp = client.post(
        "/routes",
        json={
            "route_name": name,
            "vehicle_type": "bus",
            "start_stop_id": start,
            "end_stop_id": end,
            "total_stops": 2,
        },
        headers=_admin_headers(),
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["route_name"] == name
    assert body["route_id"].startswith("M")
    assert body["status"] == "active"

    session = SessionLocal()
    session.execute(text("DELETE FROM routes WHERE route_id = :rid"), {"rid": body["route_id"]})
    session.commit()
    session.close()


def test_create_route_404s_for_unknown_start_stop(client, two_stops):
    _, end = two_stops
    resp = client.post(
        "/routes",
        json={
            "route_name": "Bad Start Route",
            "vehicle_type": "bus",
            "start_stop_id": "S_DOES_NOT_EXIST",
            "end_stop_id": end,
            "total_stops": 2,
        },
        headers=_admin_headers(),
    )
    assert resp.status_code == 404


def test_create_route_404s_for_unknown_end_stop(client, two_stops):
    start, _ = two_stops
    resp = client.post(
        "/routes",
        json={
            "route_name": "Bad End Route",
            "vehicle_type": "bus",
            "start_stop_id": start,
            "end_stop_id": "S_DOES_NOT_EXIST",
            "total_stops": 2,
        },
        headers=_admin_headers(),
    )
    assert resp.status_code == 404


# --- POST /routes/{route_id}/stops ------------------------------------------


@pytest.fixture
def route_with_no_stops(client, two_stops):
    start, end = two_stops
    resp = client.post(
        "/routes",
        json={
            "route_name": f"Linkable Route {uuid.uuid4().hex[:6]}",
            "vehicle_type": "bus",
            "start_stop_id": start,
            "end_stop_id": end,
            "total_stops": 0,
        },
        headers=_admin_headers(),
    )
    assert resp.status_code == 201, resp.text
    route_id = resp.json()["route_id"]
    yield route_id, start
    session = SessionLocal()
    session.execute(text("DELETE FROM route_stops WHERE route_id = :rid"), {"rid": route_id})
    session.execute(text("DELETE FROM routes WHERE route_id = :rid"), {"rid": route_id})
    session.commit()
    session.close()


def test_add_route_stop_succeeds_and_bumps_graph_version(client, route_with_no_stops):
    route_id, stop_id = route_with_no_stops

    session = SessionLocal()
    version_before = session.execute(text("SELECT version FROM graph_meta WHERE id = 1")).scalar_one()
    session.close()

    resp = client.post(
        f"/routes/{route_id}/stops",
        json={"stop_id": stop_id, "sequence_no": 1},
        headers=_admin_headers(),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json() == {"route_id": route_id, "stop_id": stop_id, "sequence_no": 1}

    session = SessionLocal()
    linked = session.get(RouteStop, (route_id, 1))
    assert linked is not None
    assert linked.stop_id == stop_id

    version_after = session.execute(text("SELECT version FROM graph_meta WHERE id = 1")).scalar_one()
    session.close()
    assert version_after > version_before, "add_route_stop must bump graph_meta.version so cached graphs refresh"


def test_add_route_stop_404s_for_unknown_route(client, two_stops):
    start, _ = two_stops
    resp = client.post(
        "/routes/R_DOES_NOT_EXIST/stops",
        json={"stop_id": start, "sequence_no": 1},
        headers=_admin_headers(),
    )
    assert resp.status_code == 404


def test_add_route_stop_404s_for_unknown_stop(client, route_with_no_stops):
    route_id, _ = route_with_no_stops
    resp = client.post(
        f"/routes/{route_id}/stops",
        json={"stop_id": "S_DOES_NOT_EXIST", "sequence_no": 1},
        headers=_admin_headers(),
    )
    assert resp.status_code == 404


def test_add_route_stop_409s_on_duplicate_sequence_no(client, route_with_no_stops):
    route_id, stop_id = route_with_no_stops
    first = client.post(
        f"/routes/{route_id}/stops",
        json={"stop_id": stop_id, "sequence_no": 1},
        headers=_admin_headers(),
    )
    assert first.status_code == 201

    dup = client.post(
        f"/routes/{route_id}/stops",
        json={"stop_id": stop_id, "sequence_no": 1},
        headers=_admin_headers(),
    )
    assert dup.status_code == 409
