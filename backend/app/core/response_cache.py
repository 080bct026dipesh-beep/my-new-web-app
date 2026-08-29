"""
core/response_cache.py

Lightweight in-process TTL cache for read-mostly GET endpoints (GET
/stops, GET /routes, GET /congestion, etc). Mirrors the pattern already
used for the routing graph in app/routing/graph_builder.py: cache in
memory per worker process, and invalidate explicitly from the admin
write endpoints that change the underlying data, rather than relying on
TTL alone to catch writes.

Not shared across worker processes (no Redis) -- fine at this project's
scale (a handful of workers, read traffic that's cheap to recompute on a
miss). If this ever needs to survive restarts or be shared across
processes, swap the dict-backed store for Redis and keep the same
@cached_response / invalidate() call sites -- nothing at the call sites
needs to change.
"""

import time
from collections import defaultdict
from functools import wraps
from typing import Callable

# namespace -> {key: (expires_at_monotonic, value)}
_store: dict[str, dict[tuple, tuple[float, object]]] = defaultdict(dict)


def cached_response(namespace: str, ttl_seconds: float, key_params: tuple[str, ...]):
    """Cache a FastAPI endpoint's return value for `ttl_seconds`, keyed on
    the named query/path params in `key_params`.

    Only list the actual request-identifying kwargs (offset, limit,
    route_id, ...) in `key_params` -- never `db`, which is a per-request
    Session and isn't part of what makes two calls "the same request".

    `namespace` groups related endpoints so invalidate() can drop just
    "stops" or "routes" after a write, without wiping caches that write
    didn't affect. Uses functools.wraps so FastAPI's signature
    introspection (for query-param parsing / OpenAPI) still sees the
    original function, not this wrapper -- decorate *under* @router.get,
    as in the call sites.
    """

    def decorator(fn: Callable):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            key = tuple(kwargs.get(name) for name in key_params)
            bucket = _store[namespace]
            now = time.monotonic()

            cached = bucket.get(key)
            if cached is not None and cached[0] > now:
                return cached[1]

            result = fn(*args, **kwargs)
            bucket[key] = (now + ttl_seconds, result)
            return result

        return wrapper

    return decorator


def invalidate(namespace: str) -> None:
    """Drop every cached entry in `namespace`. Call this from any admin
    write endpoint that changes the data that namespace serves, the same
    way bump_graph_version()/get_cached_graph(refresh=True) are already
    called after writes that change routing-graph shape."""
    _store.pop(namespace, None)


def invalidate_all() -> None:
    """Mainly for tests -- clears every namespace."""
    _store.clear()
