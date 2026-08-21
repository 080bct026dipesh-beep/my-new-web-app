"""
API-level tests for GET /stops/{stop_id} — require a live Postgres/PostGIS
instance (docker compose up -d db) with migration 0002 applied and sample
data imported. Skip cleanly if no DB is reachable.
"""
import pytest
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import SessionLocal
from app.models import Stop


@pytest.fixture
def client():
    session = SessionLocal()
    try:
        session.execute(__import__("sqlalchemy").text("SELECT 1"))
    except OperationalError:
        pytest.skip("No live database available — run `docker compose up -d db` first")
    finally:
        session.close()
    return TestClient(app)


def test_read_stop_returns_matching_stop(client):
    session = SessionLocal()
    try:
        stop_id = session.execute(select(Stop.stop_id).limit(1)).scalar_one_or_none()
    finally:
        session.close()
    if stop_id is None:
        pytest.skip("No stops in DB to check")

    res = client.get(f"/stops/{stop_id}")
    assert res.status_code == 200
    assert res.json()["stop_id"] == stop_id


def test_read_stop_404s_for_unknown_id(client):
    res = client.get("/stops/S_DOES_NOT_EXIST")
    assert res.status_code == 404


def test_stops_nearby_not_shadowed_by_stop_id_route(client):
    """Regression guard: /stops/nearby must still resolve to the nearby
    handler, not get swallowed by /stops/{stop_id} matching 'nearby' as a
    literal stop_id. Missing the required lat/lng query params on the
    nearby route should 422 (validation error), not 404 (which is what
    /stops/{stop_id} would return for a stop_id of 'nearby')."""
    res = client.get("/stops/nearby")
    assert res.status_code == 422
