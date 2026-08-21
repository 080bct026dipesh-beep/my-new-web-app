"""
Verify stop coordinates in stops_production_v2.csv against OpenStreetMap
(Nominatim) data.

For each stop:
  - search OSM near the stop's own zone/district context, trying the
    stop_name (plus local-suffix-stripped variants like "Chowk"/"Bus Park"
    stripped off, since OSM often indexes the bare place name) and then
    each alias if that finds nothing close enough
  - compute haversine distance from your coordinate to the best OSM match
  - classify the result and write a verification CSV

Does NOT modify the input file.

Two modes:

  Full run (default) -- verifies every stop fresh:
      python verify_stop_coordinates.py

  Retry-only run -- carries over every stop that wasn't NO_MATCH in a
  previous run unchanged, and only re-queries the ones that were
  (previously two separate files, verify_stop_coordinates.py and
  verify_stop_coordinates_v2.py -- merged into one script with this flag
  since the only real difference was which stops got queried, not the
  verification logic itself):
      python verify_stop_coordinates.py --previous data/processed/stops_coordinate_verification.csv

Nominatim usage policy requires <= 1 request/second and a real User-Agent,
so this script rate-limits itself and will take roughly 1s per stop
queried (~6 minutes for a full run over 329 stops; much faster for a
retry-only run over just the previous NO_MATCH rows).

Usage:
    pip install pandas requests
    python verify_stop_coordinates.py [--previous PATH] [--input PATH] [--output PATH]
"""

import argparse
import math
import os
import sys
import time

import pandas as pd
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_INPUT_FILE = os.path.join(SCRIPT_DIR, "..", "raw", "stops_production_v2.csv")
DEFAULT_OUTPUT_FILE = os.path.join(SCRIPT_DIR, "..", "processed", "stops_coordinate_verification.csv")

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

OUTPUT_COLUMNS = [
    "stop_id", "stop_name", "lat", "lng", "matched_query", "osm_name",
    "osm_lat", "osm_lon", "distance_m", "num_candidates_considered", "status",
]


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


def verify_stop(stop_name, aliases, lat, lon, location_context):
    """
    Try stop_name (plus suffix-stripped variants) first; if nothing close
    enough is found, retry with each alias. Returns (osm_name, osm_lat,
    osm_lon, distance_m, matched_query, num_results_considered, status).
    """
    queries = generate_name_variants(stop_name)
    if isinstance(aliases, str) and aliases.strip():
        # aliases are comma-separated within an already-quoted CSV field
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
        # stop early if we already have a GOOD match - no need to burn
        # more requests checking aliases/variants
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


def _missing_coords_row(stop_id, stop_name, lat, lon):
    return {
        "stop_id": stop_id, "stop_name": stop_name, "lat": lat, "lng": lon,
        "matched_query": None, "osm_name": None, "osm_lat": None, "osm_lon": None,
        "distance_m": None, "num_candidates_considered": 0, "status": "MISSING_COORDS",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", default=DEFAULT_INPUT_FILE, help="raw stops CSV to verify")
    parser.add_argument("--output", default=DEFAULT_OUTPUT_FILE, help="where to write the verification CSV")
    parser.add_argument(
        "--previous",
        default=None,
        help=(
            "path to a prior verification CSV. If given, every stop that "
            "wasn't NO_MATCH there is carried over unchanged, and only "
            "NO_MATCH/new stops are re-queried. Omit for a full fresh run "
            "over every stop."
        ),
    )
    args = parser.parse_args()

    stops = pd.read_csv(args.input)
    required_cols = {"stop_id", "stop_name", "lat", "lng"}
    missing = required_cols - set(stops.columns)
    if missing:
        raise SystemExit(f"Input file is missing required columns: {missing}")

    has_location_context = {"zone", "district"}.issubset(stops.columns)
    if args.previous and not has_location_context:
        raise SystemExit(
            "--previous (retry-only mode) needs 'zone' and 'district' columns "
            "in the input file to build accurate location context for the retry queries."
        )

    if args.previous:
        if os.path.exists(args.previous):
            prev = pd.read_csv(args.previous).set_index("stop_id")
            print(f"Loaded previous results for {len(prev)} stops from {args.previous}")
        else:
            print(f"--previous file {args.previous} not found -- treating as a full fresh run.")
            prev = pd.DataFrame(columns=OUTPUT_COLUMNS[1:]).set_index(pd.Index([], name="stop_id"))

        to_retry = [
            row["stop_id"] for _, row in stops.iterrows()
            if row["stop_id"] not in prev.index or prev.loc[row["stop_id"], "status"] == "NO_MATCH"
        ]
        print(f"Retrying {len(to_retry)} of {len(stops)} stops (previously NO_MATCH or new)")
    else:
        prev = pd.DataFrame(columns=OUTPUT_COLUMNS[1:]).set_index(pd.Index([], name="stop_id"))
        to_retry = list(stops["stop_id"])

    to_retry_set = set(to_retry)
    stops_by_id = stops.set_index("stop_id")
    rows = []

    # Carry over anything that doesn't need retrying (empty on a full run).
    for sid in prev.index:
        if sid not in to_retry_set:
            r = prev.loc[sid].to_dict()
            r["stop_id"] = sid
            rows.append(r)

    for i, sid in enumerate(to_retry):
        row = stops_by_id.loc[sid]
        stop_name = row["stop_name"]
        aliases = row.get("aliases", None)
        lat, lon = row["lat"], row["lng"]

        if has_location_context:
            location_context = f"{row['zone']}, {str(row['district']).title()}"
        else:
            location_context = "Kathmandu"

        print(f"[{i + 1}/{len(to_retry)}] {sid} - {stop_name}  ({location_context})")

        if pd.isna(lat) or pd.isna(lon):
            rows.append(_missing_coords_row(sid, stop_name, lat, lon))
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

    out = pd.DataFrame(rows)[OUTPUT_COLUMNS].sort_values("stop_id").reset_index(drop=True)
    out.to_csv(args.output, index=False)

    print("\nDone.")
    print(out["status"].value_counts())
    print(f"\nWrote {args.output}")


if __name__ == "__main__":
    main()
