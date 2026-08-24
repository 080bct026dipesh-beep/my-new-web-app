#!/usr/bin/env python3
"""
One-off fixer for rows in routes_production_v2_fixed.csv where a free-text
field (operator, operator_id_raw, notes, etc.) contains an unquoted embedded
comma -- e.g. `public,Samyukta Yatayat` or `OP012,OP022` -- which shifts
every column after it out of alignment.

Strategy (same idea as fix_stops_aliases.py): for any row with more tokens
than the real header expects, brute-force search over which token(s) to
merge back into the preceding column, accepting only a candidate fix where
every column matches its expected shape (stop-id pattern, OP-code pattern,
boolean, timestamp, HH:MM:SS, numeric) everywhere in the row. Rows where no
combination validates are left untouched and reported for manual review.

Usage:
    python data/scripts/fix_routes_compound_fields.py data/raw/routes_production_v2_fixed.csv           # dry run, prints proposed fixes
    python data/scripts/fix_routes_compound_fields.py data/raw/routes_production_v2_fixed.csv --apply    # writes the fixes back to the file (backs up first)
"""
import csv
import re
import sys
from itertools import combinations
from pathlib import Path

REAL_HEADER = [
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
N_REAL = len(REAL_HEADER)  # 31

STOP_ID = re.compile(r"^S\d+$")
OP_ID = re.compile(r"^OP\d+$")
BOOL = {"True", "False"}
TIME_HMS = re.compile(r"^\d{2}:\d{2}:\d{2}$")
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$")
NUMERIC = re.compile(r"^-?\d+(\.\d+)?$")
INTEGER = re.compile(r"^-?\d+$")


def _blank_ok(pattern):
    return lambda v: v == "" or bool(pattern.fullmatch(v))


VALIDATORS = {
    "start_stop_id": _blank_ok(STOP_ID),
    "end_stop_id": _blank_ok(STOP_ID),
    "total_stops": _blank_ok(INTEGER),
    "approx_distance_km": _blank_ok(NUMERIC),
    "estimated_duration_min": _blank_ok(NUMERIC),
    "service_start_time": _blank_ok(TIME_HMS),
    "service_end_time": _blank_ok(TIME_HMS),
    "frequency_min": _blank_ok(INTEGER),
    "has_ac": _blank_ok(re.compile("|".join(BOOL))),
    "is_express": _blank_ok(re.compile("|".join(BOOL))),
    "created_at": _blank_ok(TIMESTAMP),
    "updated_at": _blank_ok(TIMESTAMP),
    "operator_id": _blank_ok(OP_ID),
    "return_leg_verified": _blank_ok(re.compile("|".join(BOOL))),
    "operator_id_raw": _blank_ok(OP_ID),
    "is_multi_operator": _blank_ok(re.compile("|".join(BOOL))),
    "haversine_distance_km": _blank_ok(NUMERIC),
    "max_consecutive_stop_jump_km": _blank_ok(NUMERIC),
    "approx_distance_km_original": _blank_ok(NUMERIC),
    "distance_flagged_for_recompute": _blank_ok(re.compile("|".join(BOOL))),
    "status_corrected_for_return_leg": _blank_ok(re.compile("|".join(BOOL))),
}

MERGE_CANDIDATES = {"operator", "operator_id_raw", "notes", "status", "fare_type", "route_name"}


def validate(row):
    if len(row) != N_REAL:
        return False
    for name, value in zip(REAL_HEADER, row):
        v = VALIDATORS.get(name)
        if v and not v(value):
            return False
    return True


def try_fix(tokens):
    extra = len(tokens) - N_REAL
    if extra <= 0:
        return tokens if len(tokens) == N_REAL else None

    candidate_points = list(range(1, len(tokens)))

    for combo in combinations(candidate_points, extra):
        merged = list(tokens)
        for i in sorted(combo, reverse=True):
            merged[i - 1] = merged[i - 1] + "," + merged[i]
            del merged[i]
        if len(merged) == N_REAL and validate(merged):
            return merged
    return None


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = Path(sys.argv[1])
    apply = "--apply" in sys.argv

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader)
        rows = list(reader)

    n_pad = len(header) - N_REAL

    fixed_count = 0
    unfixed = []
    out_rows = []
    for lineno, row in enumerate(rows, start=2):
        core = row[:]
        while len(core) > N_REAL and core[-1] == "":
            core.pop()

        if len(core) == N_REAL:
            out_rows.append(row)
            continue

        fix = try_fix(core)
        if fix is None:
            unfixed.append((lineno, row))
            out_rows.append(row)
            continue

        fixed_count += 1
        padded = fix + [""] * n_pad
        print(f"Line {lineno} ({fix[0]}): FIXED")
        print(f"  before: {row}")
        print(f"  after:  {fix}")
        out_rows.append(padded)

    print(f"\n{fixed_count} row(s) auto-fixed, {len(unfixed)} row(s) need manual review.")
    for lineno, row in unfixed:
        print(f"  UNFIXED line {lineno}: {row}")

    if apply and fixed_count:
        backup = path.with_suffix(path.suffix + ".bak_compound")
        path.rename(backup)
        with open(path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            writer.writerow(header)
            writer.writerows(out_rows)
        print(f"\nWrote fixes to {path} (backup saved at {backup})")
    elif apply:
        print("\n--apply given but nothing was fixed; file left unchanged.")
    else:
        print("\nDry run only -- re-run with --apply to write these fixes.")


if __name__ == "__main__":
    main()
