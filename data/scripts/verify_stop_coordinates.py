"""
Verify stop coordinates in stops_production_v2.csv against OpenStreetMap
(Nominatim) data.

For each stop:
  - search OSM near the stop's own coordinate using stop_name
  - if that finds nothing (or nothing close), retry using each alias
  - compute haversine distance from your coordinate to the best OSM match
  - classify the result and write a verification CSV

Does NOT modify the input file.

Usage:
    pip install pandas requests
    python verify_stop_coordinates.py

Nominatim usage policy requires <= 1 request/second and a real User-Agent,
so this script rate-limits itself and will take roughly 1s per stop
(~6 minutes for 329 stops). Run it once and cache the output rather than
re-running repeatedly.
"""

import math
import time
import sys
import requests
import pandas as pd

import os

# Resolve paths relative to this script's own location (data/scripts/),
# so it works the same whether you run it from data/, data/scripts/,
# or anywhere else.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(SCRIPT_DIR, "..", "raw", "stops_production_v2.csv")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "..", "processed", "stops_coordinate_verification.csv")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {
    # Nominatim requires an identifying User-Agent; replace the email
    # with a real contact if you plan to run this more than a handful
    # of times, per their usage policy.
    "User-Agent": "KathmanduBusRouteFinder/1.0 (contact: xsafe23@gmail.com)"
}

REQUEST_DELAY_SECONDS = 1.1  # stay under Nominatim's 1 req/s limit

# Distance thresholds (meters) for classifying a match
GOOD_THRESHOLD_M = 50
PROBABLY_OK_THRESHOLD_M = 150
REVIEW_THRESHOLD_M = 500

# Kathmandu valley bounding box, used as a sanity check for OSM results
# (loose box covering the valley + a margin)
VALID_LAT_RANGE = (27.55, 27.85)
VALID_LNG_RANGE = (85.15, 85.55)


def haversine(lat1, lon1, lat2, lon2):
    """Distance between two coordinates in meters."""
    R = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def search_osm(query, lat, lon):
    """Search Nominatim for `query`, biased toward (lat, lon)."""
    params = {
        "q": f"{query}, Kathmandu, Nepal",
        "format": "json",
        "limit": 5,
        "addressdetails": 1,
        # Nominatim 'viewbox' + bounded biases results toward the valley
        # without excluding results outside it entirely (bounded=0 below
        # would exclude; we leave it unbounded but still get lat/lon-aware
        # ranking from the 'q' text since we appended the city/country).
    }
    try:
        response = requests.get(params=params, url=NOMINATIM_URL, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"  ! OSM request failed for '{query}': {e}", file=sys.stderr)
        return []


def best_match(results, lat, lon):
    """From a list of Nominatim results, return the one closest to (lat, lon)."""
    best = None
    best_dist = None
    for r in results:
        try:
            r_lat = float(r["lat"])
            r_lon = float(r["lon"])
        except (KeyError, ValueError, TypeError):
            continue
        # discard results wildly outside the valley - almost certainly a
        # same-name place in a different city/country
        if not (VALID_LAT_RANGE[0] <= r_lat <= VALID_LAT_RANGE[1]):
            continue
        if not (VALID_LNG_RANGE[0] <= r_lon <= VALID_LNG_RANGE[1]):
            continue
        d = haversine(lat, lon, r_lat, r_lon)
        if best_dist is None or d < best_dist:
            best_dist = d
            best = r
    return best, best_dist


def classify(distance_m):
    if distance_m is None:
        return "NO_MATCH"
    if distance_m <= GOOD_THRESHOLD_M:
        return "GOOD"
    if distance_m <= PROBABLY_OK_THRESHOLD_M:
        return "PROBABLY_OK"
    if distance_m <= REVIEW_THRESHOLD_M:
        return "REVIEW"
    return "FLAGGED"


def verify_stop(stop_id, stop_name, aliases, lat, lon):
    """
    Try stop_name first; if nothing close enough is found, retry with
    each alias. Returns (osm_name, osm_lat, osm_lon, distance_m,
    matched_query, num_results_considered, status).
    """
    queries = [stop_name]
    if isinstance(aliases, str) and aliases.strip():
        # aliases are comma-separated within an already-quoted CSV field
        queries += [a.strip() for a in aliases.split(",") if a.strip()]

    best_overall = None
    best_overall_dist = None
    best_query = None
    total_considered = 0

    for q in queries:
        results = search_osm(q, lat, lon)
        time.sleep(REQUEST_DELAY_SECONDS)
        total_considered += len(results)
        match, dist = best_match(results, lat, lon)
        if match is not None and (best_overall_dist is None or dist < best_overall_dist):
            best_overall, best_overall_dist, best_query = match, dist, q
        # stop early if we already have a GOOD match - no need to burn
        # more requests checking aliases
        if best_overall_dist is not None and best_overall_dist <= GOOD_THRESHOLD_M:
            break

    if best_overall is None:
        return None, None, None, None, None, total_considered, "NO_MATCH"

    osm_name = best_overall.get("display_name", "")
    return (
        osm_name,
        float(best_overall["lat"]),
        float(best_overall["lon"]),
        round(best_overall_dist, 1),
        best_query,
        total_considered,
        classify(best_overall_dist),
    )


def main():
    df = pd.read_csv(INPUT_FILE)

    required_cols = {"stop_id", "stop_name", "lat", "lng"}
    missing = required_cols - set(df.columns)
    if missing:
        raise SystemExit(f"Input file is missing required columns: {missing}")

    rows = []
    total = len(df)
    for i, row in df.iterrows():
        stop_id = row["stop_id"]
        stop_name = row["stop_name"]
        aliases = row.get("aliases", None)
        lat = row["lat"]
        lon = row["lng"]

        print(f"[{i + 1}/{total}] {stop_id} - {stop_name}")

        if pd.isna(lat) or pd.isna(lon):
            rows.append({
                "stop_id": stop_id, "stop_name": stop_name, "lat": lat, "lng": lon,
                "matched_query": None, "osm_name": None, "osm_lat": None, "osm_lon": None,
                "distance_m": None, "num_candidates_considered": 0, "status": "MISSING_COORDS",
            })
            continue

        osm_name, osm_lat, osm_lon, dist, matched_query, n_considered, status = verify_stop(
            stop_id, stop_name, aliases, lat, lon
        )

        rows.append({
            "stop_id": stop_id,
            "stop_name": stop_name,
            "lat": lat,
            "lng": lon,
            "matched_query": matched_query,
            "osm_name": osm_name,
            "osm_lat": osm_lat,
            "osm_lon": osm_lon,
            "distance_m": dist,
            "num_candidates_considered": n_considered,
            "status": status,
        })

    out = pd.DataFrame(rows)
    out.to_csv(OUTPUT_FILE, index=False)

    print("\nDone.")
    print(out["status"].value_counts())
    print(f"\nWrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
