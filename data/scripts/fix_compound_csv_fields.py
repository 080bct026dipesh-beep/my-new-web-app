#!/usr/bin/env python3
"""
One-off fixer for raw CSV rows where an unquoted embedded comma in a
free-text field shifted every column after it out of alignment.

Merges data/scripts/fix_stops_aliases.py and
data/scripts/fix_routes_compound_fields.py into one script. Both did the
same job (brute-force merge extra comma-split tokens back into the field
that produced them, keep only a candidate that validates) against two
different files with two different column layouts, and -- worth noting --
two different safety behaviors: the routes fixer defaulted to a dry run
and backed up before writing, the stops fixer wrote in place
unconditionally with no backup. This version uses the safer contract
(dry run by default, --apply required to write, backup taken first) for
both profiles.

As of the current committed data/raw/*.csv, both profiles report 0 rows
needing a fix -- the corruption they target has already been cleaned up
upstream. Kept for the next raw-data refresh, in case it recurs.

Usage:
    python data/scripts/fix_compound_csv_fields.py stops data/raw/stops_production_v2.csv
    python data/scripts/fix_compound_csv_fields.py routes data/raw/routes_production_v2_fixed.csv --apply
"""
import argparse
import csv
import re
from itertools import combinations
from pathlib import Path

# ---------------------------------------------------------------- stops --
# Strategy: if lat (index 3) doesn't parse as a float in the plausible
# Kathmandu-valley range, progressively merge fields starting at `aliases`
# (index 2) until lat/lng line up as valid floats again.

STOPS_LAT_RANGE = (27.5, 27.9)
STOPS_LNG_RANGE = (85.1, 85.6)


def _stops_valid_lat(s):
    try:
        return STOPS_LAT_RANGE[0] < float(s) < STOPS_LAT_RANGE[1]
    except ValueError:
        return False


def _stops_valid_lng(s):
    try:
        return STOPS_LNG_RANGE[0] < float(s) < STOPS_LNG_RANGE[1]
    except ValueError:
        return False


def fix_stops_row(row):
    """Returns (row_or_fix, changed) where changed is True/False/None
    (None = row is broken and no merge fixed it)."""
    if len(row) >= 5 and _stops_valid_lat(row[3]) and _stops_valid_lng(row[4]):
        return row, False

    for k in range(2, min(8, len(row) - 3)):
        merged_alias = ", ".join(x for x in row[2:2 + k] if x != "")
        candidate = row[0:2] + [merged_alias] + row[2 + k:]
        if len(candidate) >= 5 and _stops_valid_lat(candidate[3]) and _stops_valid_lng(candidate[4]):
            return candidate, True

    if len(row) >= 5 and not (_stops_valid_lat(row[3]) and _stops_valid_lng(row[4])):
        return row, None
    return row, False


# --------------------------------------------------------------- routes --
# Strategy: for any row with more tokens than the real header expects,
# brute-force search over which token(s) to merge back into the preceding
# column, accepting only a candidate where every column matches its
# expected shape (stop-id pattern, OP-code pattern, boolean, timestamp,
# HH:MM:SS, numeric) everywhere in the row.

ROUTES_HEADER = [
    "route_id", "route_name", "short_name", "vehicle_type", "route_type",
    "operator", "start_stop_id", "end_stop_id", "total_stops",
    "approx_distance_km", "estimated_duration_min", "service_start_time",
    "service_end_time", "frequency_min", "fare_type", "has_ac", "is_express",
    "status", "notes", "created_at", "updated_at", "operator_id",
    "return_leg_verified", "operator_id_raw", "is_multi_operator",
    "haversine_distance_km", "max_consecutive_stop_jump_km",
    "approx_distance_km_original", "distance_flagged_for_recompute",
    "status_original", "status_corrected_for_return_leg",
]
N_ROUTES = len(ROUTES_HEADER)  # 31

_STOP_ID = re.compile(r"^S\d+$")
_OP_ID = re.compile(r"^OP\d+$")
_BOOL = re.compile("True|False")
_TIME_HMS = re.compile(r"^\d{2}:\d{2}:\d{2}$")
_TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$")
_NUMERIC = re.compile(r"^-?\d+(\.\d+)?$")
_INTEGER = re.compile(r"^-?\d+$")


def _blank_ok(pattern):
    return lambda v: v == "" or bool(pattern.fullmatch(v))


ROUTES_VALIDATORS = {
    "start_stop_id": _blank_ok(_STOP_ID),
    "end_stop_id": _blank_ok(_STOP_ID),
    "total_stops": _blank_ok(_INTEGER),
    "approx_distance_km": _blank_ok(_NUMERIC),
    "estimated_duration_min": _blank_ok(_NUMERIC),
    "service_start_time": _blank_ok(_TIME_HMS),
    "service_end_time": _blank_ok(_TIME_HMS),
    "frequency_min": _blank_ok(_INTEGER),
    "has_ac": _blank_ok(_BOOL),
    "is_express": _blank_ok(_BOOL),
    "created_at": _blank_ok(_TIMESTAMP),
    "updated_at": _blank_ok(_TIMESTAMP),
    "operator_id": _blank_ok(_OP_ID),
    "return_leg_verified": _blank_ok(_BOOL),
    "operator_id_raw": _blank_ok(_OP_ID),
    "is_multi_operator": _blank_ok(_BOOL),
    "haversine_distance_km": _blank_ok(_NUMERIC),
    "max_consecutive_stop_jump_km": _blank_ok(_NUMERIC),
    "approx_distance_km_original": _blank_ok(_NUMERIC),
    "distance_flagged_for_recompute": _blank_ok(_BOOL),
    "status_corrected_for_return_leg": _blank_ok(_BOOL),
}


def _routes_validate(row):
    if len(row) != N_ROUTES:
        return False
    return all(
        (v := ROUTES_VALIDATORS.get(name)) is None or v(value)
        for name, value in zip(ROUTES_HEADER, row)
    )


def fix_routes_row(row):
    core = list(row)
    while len(core) > N_ROUTES and core[-1] == "":
        core.pop()

    if len(core) == N_ROUTES:
        return row, False

    extra = len(core) - N_ROUTES
    if extra > 0:
        for combo in combinations(range(1, len(core)), extra):
            merged = list(core)
            for i in sorted(combo, reverse=True):
                merged[i - 1] = merged[i - 1] + "," + merged[i]
                del merged[i]
            if len(merged) == N_ROUTES and _routes_validate(merged):
                return merged, True

    return row, None


# ------------------------------------------------------------- profiles --

PROFILES = {
    "stops": {
        "fix_row": fix_stops_row,
        "default_path": "data/raw/stops_production_v2.csv",
    },
    "routes": {
        "fix_row": fix_routes_row,
        "default_path": "data/raw/routes_production_v2_fixed.csv",
    },
}


# --------------------------------------------------------------- shared --

def run(profile_name: str, path: Path, apply: bool) -> None:
    fix_row = PROFILES[profile_name]["fix_row"]

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    # routes_production_v2_fixed.csv (like the other raw exports) can carry
    # trailing blank columns beyond the real schema (stray trailing commas
    # from the original export) -- pad any fixed row back out to the
    # header's actual width so row length still matches the header, same
    # as the original fix_routes_compound_fields.py did. No-op for the
    # stops profile (its header always matches the real column count).
    n_pad = max(0, len(header) - len(ROUTES_HEADER)) if profile_name == "routes" else 0

    fixed_count = 0
    unfixed = []
    out_rows = []
    for lineno, row in enumerate(rows, start=2):
        new_row, changed = fix_row(row)
        if changed is None:
            unfixed.append((lineno, row))
        elif changed:
            fixed_count += 1
            padded = new_row + [""] * n_pad
            print(f"Line {lineno}: FIXED")
            print(f"  before: {row}")
            print(f"  after:  {padded}")
            new_row = padded
        out_rows.append(new_row)

    print(f"\n{fixed_count} row(s) auto-fixed, {len(unfixed)} row(s) need manual review.")
    for lineno, row in unfixed:
        print(f"  UNFIXED line {lineno}: {row}")

    if not apply:
        print("\nDry run only -- re-run with --apply to write these fixes.")
        return

    if not fixed_count:
        print("\n--apply given but nothing was fixed; file left unchanged.")
        return

    backup = path.with_suffix(path.suffix + ".bak_compound")
    path.rename(backup)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)
        writer.writerows(out_rows)
    print(f"\nWrote fixes to {path} (backup saved at {backup})")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("profile", choices=sorted(PROFILES), help="which file layout to fix")
    parser.add_argument("path", nargs="?", help="defaults to the profile's usual raw CSV path")
    parser.add_argument("--apply", action="store_true", help="write fixes back (default: dry run)")
    args = parser.parse_args()

    path = Path(args.path) if args.path else Path(PROFILES[args.profile]["default_path"])
    run(args.profile, path, args.apply)


if __name__ == "__main__":
    main()
