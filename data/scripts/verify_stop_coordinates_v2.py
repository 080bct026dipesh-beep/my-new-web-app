"""
V2: re-verify only the NO_MATCH stops from a previous verification run,
using two fixes over v1:

  1. Correct location context per stop (zone + actual district — KATHMANDU,
     BHAKTAPUR, LALITPUR, KAVREPALANCHOK — instead of hardcoding
     "Kathmandu, Nepal" for every query, which biased results for stops
     outside Kathmandu district).
  2. Fuzzy name variants: strips common local suffixes ("Stop", "Chowk",
     "Chowk Stop", "Junction", "Bus Park", "Bus Station", "Sadak", "Marg",
     "Tole") since OSM often indexes the bare place name without them.

Stops that already had a non-NO_MATCH status in the previous run are
carried over unchanged (not re-queried), to save time and requests.

Usage:
    pip install pandas requests
    python verify_stop_coordinates_v2.py
"""

import math
import os
import time
import sys
import requests
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_STOPS_FILE = os.path.join(SCRIPT_DIR, "..", "raw", "stops_production_v2.csv")
PREVIOUS_VERIFICATION_FILE = os.path.join(
    SCRIPT_DIR, "..", "processed", "stops_coordinate_verification.csv"
)
OUTPUT_FILE = os.path.join(
    SCRIPT_DIR, "..", "processed", "stops_coordinate_verification_v2.csv"
)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
HEADERS = {
    "User-Agent": "KathmanduBusRouteFinder/1.0 (contact: xsafe23@gmail.com)"
}

REQUEST_DELAY_SECONDS = 1.1

GOOD_THRESHOLD_M = 50
PROBABLY_OK_THRESHOLD_M = 150
REVIEW_THRESHOLD_M = 500

VALID_LAT_RANGE = (27.55, 27.85)
VALID_LNG_RANGE = (85.15, 85.55)

# Longest/most specific suffixes first, so "Chowk Stop" strips as a unit
# before "Stop" or "Chowk" alone would strip separately.
STRIP_SUFFIXES = [
    "chowk stop",
    "bus park",
    "bus station",
    "stop",
    "chowk",
    "junction",
    "sadak",
    "marg",
    "tole",
]


def haversine(lat1, lon1, lat2, lon2):
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


def generate_name_variants(name):
    """Original name plus versions with trailing local suffixes stripped."""
    variants = [name]
    lower = name.lower()
    for suf in STRIP_SUFFIXES:
        if lower.endswith(" " + suf) or lower == suf:
            stripped = name[: -(len(suf) + 1)].strip() if lower != suf else ""
            if stripped and stripped not in variants:
                variants.append(stripped)
    return variants


def search_osm(query, location_context):
    params = {
        "q": f"{query}, {location_context}, Nepal",
        "format": "json",
        "limit": 5,
        "addressdetails": 1,
    }
    try:
        response = requests.get(params=params, url=NOMINATIM_URL, headers=HEADERS, timeout=15)
        response.raise_for_status()
        return response.json()
    except requests.RequestException as e:
        print(f"  ! OSM request failed for '{query}': {e}", file=sys.stderr)
        return []


def best_match(results, lat, lon):
    best = None
    best_dist = None
    for r in results:
        try:
            r_lat = float(r["lat"])
            r_lon = float(r["lon"])
        except (KeyError, ValueError, TypeError):
            continue
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


def verify_stop(stop_name, aliases, lat, lon, location_context):
    queries = generate_name_variants(stop_name)
    if isinstance(aliases, str) and aliases.strip():
        queries += [a.strip() for a in aliases.split(",") if a.strip()]

    best_overall = None
    best_overall_dist = None
    best_query = None
    total_considered = 0

    for q in queries:
        results = search_osm(q, location_context)
        time.sleep(REQUEST_DELAY_SECONDS)
        total_considered += len(results)
        match, dist = best_match(results, lat, lon)
        if match is not None and (best_overall_dist is None or dist < best_overall_dist):
            best_overall, best_overall_dist, best_query = match, dist, q
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
    stops = pd.read_csv(RAW_STOPS_FILE)
    required_cols = {"stop_id", "stop_name", "lat", "lng", "zone", "district"}
    missing = required_cols - set(stops.columns)
    if missing:
        raise SystemExit(f"Raw stops file is missing required columns: {missing}")

    if os.path.exists(PREVIOUS_VERIFICATION_FILE):
        prev = pd.read_csv(PREVIOUS_VERIFICATION_FILE).set_index("stop_id")
        print(f"Loaded previous results for {len(prev)} stops from {PREVIOUS_VERIFICATION_FILE}")
    else:
        prev = pd.DataFrame(columns=[
            "stop_name", "lat", "lng", "matched_query", "osm_name",
            "osm_lat", "osm_lon", "distance_m", "num_candidates_considered", "status",
        ]).set_index(pd.Index([], name="stop_id"))
        print("No previous verification file found — will verify every stop fresh.")

    to_retry = []
    for _, row in stops.iterrows():
        sid = row["stop_id"]
        if sid in prev.index and prev.loc[sid, "status"] != "NO_MATCH":
            continue
        to_retry.append(sid)

    print(f"Retrying {len(to_retry)} of {len(stops)} stops (previously NO_MATCH or new)")

    stops_by_id = stops.set_index("stop_id")
    rows = []

    # carry over everything that doesn't need retrying
    for sid in prev.index:
        if sid not in to_retry:
            r = prev.loc[sid].to_dict()
            r["stop_id"] = sid
            rows.append(r)

    for i, sid in enumerate(to_retry):
        row = stops_by_id.loc[sid]
        stop_name = row["stop_name"]
        aliases = row.get("aliases", None)
        lat, lon = row["lat"], row["lng"]
        zone, district = row["zone"], str(row["district"]).title()
        location_context = f"{zone}, {district}"

        print(f"[{i + 1}/{len(to_retry)}] {sid} - {stop_name}  ({location_context})")

        if pd.isna(lat) or pd.isna(lon):
            rows.append({
                "stop_id": sid, "stop_name": stop_name, "lat": lat, "lng": lon,
                "matched_query": None, "osm_name": None, "osm_lat": None, "osm_lon": None,
                "distance_m": None, "num_candidates_considered": 0, "status": "MISSING_COORDS",
            })
            continue

        osm_name, osm_lat, osm_lon, dist, matched_query, n_considered, status = verify_stop(
            stop_name, aliases, lat, lon, location_context
        )

        rows.append({
            "stop_id": sid,
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
    cols = ["stop_id", "stop_name", "lat", "lng", "matched_query", "osm_name",
            "osm_lat", "osm_lon", "distance_m", "num_candidates_considered", "status"]
    out = out[cols].sort_values("stop_id").reset_index(drop=True)
    out.to_csv(OUTPUT_FILE, index=False)

    print("\nDone.")
    print(out["status"].value_counts())
    print(f"\nWrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
