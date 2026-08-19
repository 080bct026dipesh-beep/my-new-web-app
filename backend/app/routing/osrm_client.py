import os
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


def get_route_geometry(coords: list[tuple[float, float]], profile: str = "driving") -> dict:
    """coords: list of (lat, lon) in travel order, at least 2 points."""
    if len(coords) < 2:
        raise ValueError("Need at least 2 coordinates for OSRM routing")

    base_url = _PROFILE_BASE_URLS.get(profile, OSRM_BASE_URL)
    coord_str = ";".join(f"{lon},{lat}" for lat, lon in coords)
    url = f"{base_url}/route/v1/{profile}/{coord_str}"
    params = {"overview": "full", "geometries": "geojson"}

    try:
        resp = requests.get(url, params=params, timeout=5)
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise OSRMError(str(exc)) from exc

    data = resp.json()
    if data.get("code") != "Ok":
        raise OSRMError(f"OSRM returned code={data.get('code')}")

    route = data["routes"][0]
    return {
        "geometry": route["geometry"],   # GeoJSON LineString
        "distance_m": route["distance"],
        "duration_s": route["duration"],
    }