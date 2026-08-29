"""
tests/conftest.py

Shared pytest fixtures across the whole backend test suite.
"""
import pytest

from app.core.response_cache import invalidate_all


@pytest.fixture(autouse=True)
def _reset_response_cache():
    """The in-process response cache (app/core/response_cache.py) is a
    module-level dict that persists for the life of the test process --
    same as it does in production, since that's the whole point of it.

    In production that's fine: writes go through the admin endpoints,
    which call invalidate() on the right namespace. In tests, several
    files call endpoints directly, mutate the DB via monkeypatch or raw
    SQL without going through those admin endpoints, or intentionally
    trigger a downstream failure (e.g. monkeypatching OSRM to raise) for
    a route_id an earlier test already cached a success for. Without a
    reset, that earlier success gets served instead of ever calling the
    monkeypatched code, and the test fails for a reason that has nothing
    to do with what it's actually checking.

    Clearing on both sides of every test keeps this cache from ever
    leaking state across tests, the same way test_pathfinder_alternatives.py
    already resets the routing-graph cache around each of its tests.
    """
    invalidate_all()
    yield
    invalidate_all()
