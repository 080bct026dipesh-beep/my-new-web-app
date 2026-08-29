import os
import time
import requests

OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "http://localhost:5000")

# A single osrm-routed process only serves whichever profile its .osrm file
# was extracted with (see backend/README.md: nepal-latest.osrm is extracted
# with car.lua). Walking directions need a second osrm-routed instance
# extracted with foot.lua, so it gets its own base URL/port rather than
# reusing OSRM_BASE_URL. Falls back to OSRM_BASE_URL if unset so this
# doesn't break setups that haven't added the foot instance yet.
OSRM_FOOT_BASE_URL = os.environ.get("OSRM_FOOT_BASE_URL", OSRM_BASE_URL)

_PROFILE_BASE_URLS = {
    "foot": OSRM_FOOT_BASE_URL,
}


class OSRMError(Exception):
    pass


# Small in-process cache. Road geometry between two fixed points
# (overwhelmingly stop-to-stop pairs, which don't move) is effectively
# static, but the same origin/destination gets searched repeatedly --
# people re-run searches, and different users often want the same
# commute. Without this, every one of those hits OSRM fresh. Bounded
# size + TTL rather than unbounded, since it's a plain in-memory dict
# with no eviction otherwise -- fine for a single-process deployment;
# revisit alongside the graph-cache multi-worker note in
# app/routing/graph_builder.py if this ever runs with multiple workers.
_ROUTE_CACHE_TTL_S = 300
_ROUTE_CACHE_MAX_ENTRIES = 500
_route_cache: dict[tuple, tuple[float, dict]] = {}


def _cache_get(key: tuple) -> dict | None:
    entry = _route_cache.get(key)
    if entry is None:
        return None
    cached_at, value = entry
    if time.monotonic() - cached_at > _ROUTE_CACHE_TTL_S:
        del _route_cache[key]
        return None
    return value


def _cache_set(key: tuple, value: dict) -> None:
    if len(_route_cache) >= _ROUTE_CACHE_MAX_ENTRIES:
        # Cheap eviction: drop the oldest entry rather than maintaining a
        # full LRU structure -- this cache is a latency/load optimization,
        # not a correctness requirement, so approximate is fine.
        oldest_key = min(_route_cache, key=lambda k: _route_cache[k][0])
        del _route_cache[oldest_key]
    _route_cache[key] = (time.monotonic(), value)


def get_route_geometry(
    coords: list[tuple[float, float]],
    profile: str = "driving",
    bearings: list[tuple[float, int] | None] | None = None,
    radiuses: list[float | None] | None = None,
) -> dict:
    """coords: list of (lat, lon) in travel order, at least 2 points.

    bearings: optional per-waypoint (heading_degrees, range_degrees) hint,
    one entry per coordinate (or None for a given waypoint to leave it
    unconstrained). Restricts OSRM's snap to road segments travelling in
    roughly that direction -- the fix for a waypoint sitting near a
    divided road, where the nearest edge geometrically can be the wrong
    carriageway for the direction actually being travelled. See
    app/api/routing.py::_bearings_for for how these get computed.

    radiuses: optional per-waypoint max snap distance in meters (or None
    for OSRM's default of unlimited). Paired with bearings so a tight
    heading constraint can't push a snap out to some distant edge that
    happens to match -- if nothing satisfying both is within radius,
    OSRM returns an error, which callers already handle by falling back
    (see _attach_road_geometry's `except OSRMError: pass`).

    Both are optional and independent of each other; passing neither
    reproduces the previous unconstrained behavior exactly.
    """
    if len(coords) < 2:
        raise ValueError("Need at least 2 coordinates for OSRM routing")
    if bearings is not None and len(bearings) != len(coords):
        raise ValueError("bearings must have exactly one entry per coordinate")
    if radiuses is not None and len(radiuses) != len(coords):
        raise ValueError("radiuses must have exactly one entry per coordinate")

    cache_key = (
        profile,
        tuple(coords),
        tuple(bearings) if bearings is not None else None,
        tuple(radiuses) if radiuses is not None else None,
    )
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    base_url = _PROFILE_BASE_URLS.get(profile, OSRM_BASE_URL)
    coord_str = ";".join(f"{lon},{lat}" for lat, lon in coords)
    url = f"{base_url}/route/v1/{profile}/{coord_str}"
    params = {"overview": "full", "geometries": "geojson"}
    if bearings is not None:
        params["bearings"] = ";".join(
            f"{pair[0]:.0f},{pair[1]}" if pair is not None else "" for pair in bearings
        )
    if radiuses is not None:
        params["radiuses"] = ";".join(
            (str(r) if r is not None else "unlimited") for r in radiuses
        )

    # One retry on transient network errors (connection reset, brief OSRM
    # hiccup) before giving up -- avoids surfacing a hard failure to the
    # user for what's often a one-off blip.
    last_exc: requests.RequestException | None = None
    for attempt in range(2):
        try:
            resp = requests.get(url, params=params, timeout=5)
            resp.raise_for_status()
            break
        except requests.RequestException as exc:
            last_exc = exc
            if attempt == 0:
                time.sleep(0.2)
    else:
        raise OSRMError(str(last_exc)) from last_exc

    data = resp.json()
    if data.get("code") != "Ok":
        raise OSRMError(f"OSRM returned code={data.get('code')}")

    route = data["routes"][0]
    result = {
        "geometry": route["geometry"],   # GeoJSON LineString
        "distance_m": route["distance"],
        "duration_s": route["duration"],
    }
    _cache_set(cache_key, result)
    return result