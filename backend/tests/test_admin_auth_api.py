"""
API-level tests for POST /admin/login — require a live Postgres/PostGIS
instance (docker compose up -d db) with migration 2f29b3e3e5fd (admin_users)
applied. Skip cleanly if no DB is reachable.

Fully self-contained: creates and tears down its own AdminUser row rather
than depending on any seeded admin account, so it can run against any DB
that just has migrations applied.
"""
import uuid

import jwt
import pytest
from sqlalchemy.exc import OperationalError
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import get_settings
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import AdminUser

TEST_PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """The 5/minute limit on POST /admin/login is keyed by remote address,
    and TestClient requests all share the same address -- without this,
    earlier tests in this file would eat into the rate-limit test's
    budget (or vice versa). Reset slowapi's in-memory bucket around every
    test so each one starts with a clean limit window."""
    limiter.reset()
    yield
    limiter.reset()


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


@pytest.fixture
def admin_user():
    """Creates a throwaway AdminUser with a unique username, deletes it after."""
    session = SessionLocal()
    username = f"test-admin-{uuid.uuid4().hex[:8]}"
    admin = AdminUser(username=username, password_hash=hash_password(TEST_PASSWORD), role="admin")
    session.add(admin)
    session.commit()
    session.refresh(admin)
    admin_id = admin.admin_id
    session.close()
    try:
        yield username
    finally:
        session = SessionLocal()
        row = session.get(AdminUser, admin_id)
        if row is not None:
            session.delete(row)
            session.commit()
        session.close()


def test_login_succeeds_with_correct_credentials_and_returns_valid_jwt(client, admin_user):
    resp = client.post("/admin/login", json={"username": admin_user, "password": TEST_PASSWORD})
    assert resp.status_code == 200

    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    settings = get_settings()
    payload = jwt.decode(body["access_token"], settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    assert payload["username"] == admin_user
    assert payload["role"] == "admin"


def test_login_rejects_wrong_password(client, admin_user):
    resp = client.post("/admin/login", json={"username": admin_user, "password": "not-the-password"})
    assert resp.status_code == 401
    assert "access_token" not in resp.json()


def test_login_rejects_unknown_username(client):
    resp = client.post(
        "/admin/login",
        json={"username": f"does-not-exist-{uuid.uuid4().hex[:8]}", "password": "whatever"},
    )
    assert resp.status_code == 401


def test_login_does_not_leak_whether_username_exists(client, admin_user):
    """Unknown-username and wrong-password cases must return the same status
    code and detail message, so a caller can't enumerate valid usernames by
    comparing responses."""
    unknown_resp = client.post(
        "/admin/login",
        json={"username": f"does-not-exist-{uuid.uuid4().hex[:8]}", "password": "whatever"},
    )
    wrong_pw_resp = client.post(
        "/admin/login", json={"username": admin_user, "password": "not-the-password"}
    )
    assert unknown_resp.status_code == wrong_pw_resp.status_code == 401
    assert unknown_resp.json()["detail"] == wrong_pw_resp.json()["detail"]


def test_login_rejects_empty_password(client, admin_user):
    resp = client.post("/admin/login", json={"username": admin_user, "password": ""})
    assert resp.status_code == 422


def test_get_current_admin_rejects_garbage_token(client):
    """Exercises get_current_admin (app/core/security.py) directly against
    a garbage token, independent of any specific route wiring."""
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials

    from app.core.security import get_current_admin

    session = SessionLocal()
    try:
        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="not-a-real-jwt")
        with pytest.raises(HTTPException) as exc_info:
            get_current_admin(credentials=creds, db=session)
        assert exc_info.value.status_code == 401
    finally:
        session.close()


def test_login_token_grants_access_to_admin_write_endpoint(client, admin_user):
    """require_admin (app/core/security.py), the dependency behind
    app/api/admin.py and POST /admin/rebuild-graph, accepts a bearer
    token from POST /admin/login as an alternative to X-Admin-Api-Key.
    Previously nothing verified issued tokens at all -- this pins that
    a real login token now actually grants access to a protected route."""
    login_resp = client.post("/admin/login", json={"username": admin_user, "password": TEST_PASSWORD})
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    resp = client.post(
        "/stops",
        json={"stop_name": f"Test Stop JWT {uuid.uuid4().hex[:6]}", "lat": 27.7, "lng": 85.3},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text

    # Clean up -- this test doesn't use the two_stops fixture, so delete
    # directly.
    from app.db.session import SessionLocal as _SessionLocal
    from app.models import Stop

    session = _SessionLocal()
    try:
        row = session.get(Stop, resp.json()["stop_id"])
        if row is not None:
            session.delete(row)
            session.commit()
    finally:
        session.close()


def test_garbage_bearer_token_rejected_by_admin_write_endpoint(client):
    """require_admin must reject an invalid bearer token exactly like a
    missing/wrong X-Admin-Api-Key, not silently fall through."""
    resp = client.post(
        "/stops",
        json={"stop_name": "Should Not Be Created", "lat": 27.7, "lng": 85.3},
        headers={"Authorization": "Bearer not-a-real-jwt"},
    )
    assert resp.status_code == 401


def test_login_rate_limited_after_five_attempts_per_minute(client, admin_user):
    """@limiter.limit("5/minute") on POST /admin/login. slowapi keys by
    remote address; TestClient requests all share the same address, so six
    rapid requests should trip the limit on the sixth."""
    statuses = []
    for _ in range(6):
        resp = client.post(
            "/admin/login", json={"username": admin_user, "password": "not-the-password"}
        )
        statuses.append(resp.status_code)

    assert statuses[:5] == [401] * 5, f"Expected first 5 attempts to be plain 401s, got {statuses[:5]}"
    assert statuses[5] == 429, f"Expected the 6th attempt within the same minute to be rate-limited, got {statuses[5]}"
