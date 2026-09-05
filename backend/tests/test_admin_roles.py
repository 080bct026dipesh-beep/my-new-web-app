"""
API-level tests for editor/admin role enforcement (app/core/security.py's
require_role, wired into app/api/admin.py) — require a live Postgres/PostGIS
instance (docker compose up -d db) with migration 2f29b3e3e5fd (admin_users)
applied. Skip cleanly if no DB is reachable.

Role split under test:
  editor: create_stop, create_route, add_route_stop
  admin:  everything editor can do, plus update_route_status,
          reload_graph_cache

The shared X-Admin-Api-Key path carries no role at all and has always
meant full access for scripted/ETL callers -- require_role leaves that
path untouched (see its docstring), so this file only exercises the
JWT/AdminUser path.
"""
import uuid

import pytest
from sqlalchemy.exc import OperationalError
from fastapi.testclient import TestClient

from app.main import app
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import AdminUser, Stop

TEST_PASSWORD = "correct-horse-battery-staple"


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


def _make_admin_user(role: str):
    session = SessionLocal()
    username = f"test-{role}-{uuid.uuid4().hex[:8]}"
    admin = AdminUser(username=username, password_hash=hash_password(TEST_PASSWORD), role=role)
    session.add(admin)
    session.commit()
    admin_id = admin.admin_id
    session.close()
    return username, admin_id


def _delete_admin_user(admin_id: int):
    session = SessionLocal()
    row = session.get(AdminUser, admin_id)
    if row is not None:
        session.delete(row)
        session.commit()
    session.close()


@pytest.fixture
def editor_token(client):
    username, admin_id = _make_admin_user("editor")
    try:
        resp = client.post("/admin/login", json={"username": username, "password": TEST_PASSWORD})
        assert resp.status_code == 200
        yield resp.json()["access_token"]
    finally:
        _delete_admin_user(admin_id)


@pytest.fixture
def admin_token(client):
    username, admin_id = _make_admin_user("admin")
    try:
        resp = client.post("/admin/login", json={"username": username, "password": TEST_PASSWORD})
        assert resp.status_code == 200
        yield resp.json()["access_token"]
    finally:
        _delete_admin_user(admin_id)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_editor_can_create_stop(client, editor_token):
    resp = client.post(
        "/stops",
        json={"stop_name": f"Editor Test Stop {uuid.uuid4().hex[:6]}", "lat": 27.7, "lng": 85.3},
        headers=_auth(editor_token),
    )
    assert resp.status_code == 201, resp.text

    session = SessionLocal()
    row = session.get(Stop, resp.json()["stop_id"])
    if row is not None:
        session.delete(row)
        session.commit()
    session.close()


def test_admin_can_create_stop(client, admin_token):
    """admin covers everything editor covers -- not just the admin-only
    endpoints -- since it's a strict superset, not a separate lane."""
    resp = client.post(
        "/stops",
        json={"stop_name": f"Admin Test Stop {uuid.uuid4().hex[:6]}", "lat": 27.7, "lng": 85.3},
        headers=_auth(admin_token),
    )
    assert resp.status_code == 201, resp.text

    session = SessionLocal()
    row = session.get(Stop, resp.json()["stop_id"])
    if row is not None:
        session.delete(row)
        session.commit()
    session.close()


def test_editor_forbidden_from_route_status_update(client, editor_token):
    resp = client.patch(
        "/routes/R_DOES_NOT_EXIST/status",
        json={"status": "active"},
        headers=_auth(editor_token),
    )
    # 403 (role check) must fire before the 404 (route lookup) does --
    # an editor shouldn't learn whether a given route_id exists via this
    # endpoint at all.
    assert resp.status_code == 403, resp.text


def test_editor_forbidden_from_graph_reload(client, editor_token):
    resp = client.post("/graph/reload", headers=_auth(editor_token))
    assert resp.status_code == 403, resp.text


def test_admin_allowed_to_reload_graph(client, admin_token):
    resp = client.post("/graph/reload", headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "nodes" in body and "edges" in body
