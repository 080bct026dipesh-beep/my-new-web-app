#!/usr/bin/env bash
# Prepares nepal-latest.osrm (driving) and nepal-latest-foot.osrm (walking)
# for the osrm/osrm-foot services in docker-compose.yml.
#
# Replaces the manual wget/osrm-extract/osrm-partition/osrm-customize/mv
# sequence in backend/README.md ("6. (Optional) Road-network route
# geometry via OSRM") with one idempotent command. Safe to re-run: any
# stage whose output already exists is skipped, so a partial or repeated
# run just picks up where it left off. Does not touch the DB, schema, or
# app code -- this only produces the two .osrm file sets docker-compose.yml
# already expects at backend/nepal-latest*.osrm*.
#
# Usage (from repo root or backend/):
#   backend/scripts/prepare_osrm_data.sh
#   backend/scripts/prepare_osrm_data.sh --force   # rebuild even if outputs exist

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$BACKEND_DIR"

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

PBF="nepal-latest.osm.pbf"
PBF_URL="http://download.geofabrik.de/asia/nepal-latest.osm.pbf"
CAR_OSRM="nepal-latest.osrm"
FOOT_OSRM="nepal-latest-foot.osrm"
OSRM_IMAGE="osrm/osrm-backend"

run_osrm() {
  docker run --rm -t -v "${BACKEND_DIR}:/data" "$OSRM_IMAGE" "$@"
}

exists() {
  [[ "$FORCE" -eq 0 && -e "$1" ]]
}

echo "== OSRM data prep (backend/) =="

# 1. Source data
if exists "$PBF"; then
  echo "-- ${PBF} already present, skipping download"
else
  echo "-- downloading ${PBF}"
  wget -O "$PBF" "$PBF_URL"
fi

# 2. Driving profile (nepal-latest.osrm)
if exists "${CAR_OSRM}"; then
  echo "-- ${CAR_OSRM} already present, skipping car extract/partition/customize"
else
  echo "-- extracting car profile"
  run_osrm osrm-extract -p /opt/car.lua "/data/${PBF}"
  echo "-- partitioning car profile"
  run_osrm osrm-partition "/data/${CAR_OSRM}"
  echo "-- customizing car profile"
  run_osrm osrm-customize "/data/${CAR_OSRM}"
fi

# 3. Foot profile (nepal-latest-foot.osrm). osrm-extract's --output takes a
#    base path (no .osrm suffix) so the same .pbf can be extracted under a
#    second name without clobbering the car outputs above -- no manual
#    mv/rename step required (see docs/profiles.md: "You can extract the
#    same OSM file with different profiles by specifying an output path").
if exists "${FOOT_OSRM}"; then
  echo "-- ${FOOT_OSRM} already present, skipping foot extract/partition/customize"
else
  echo "-- extracting foot profile"
  run_osrm osrm-extract -p /opt/foot.lua "/data/${PBF}" --output "/data/${FOOT_OSRM%.osrm}"
  echo "-- partitioning foot profile"
  run_osrm osrm-partition "/data/${FOOT_OSRM}"
  echo "-- customizing foot profile"
  run_osrm osrm-customize "/data/${FOOT_OSRM}"
fi

echo "== done =="
echo "car:  ${BACKEND_DIR}/${CAR_OSRM}"
echo "foot: ${BACKEND_DIR}/${FOOT_OSRM}"
echo "Next: docker compose up -d osrm osrm-foot"
