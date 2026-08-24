# Setup streamlining — handover (2026-08-24)

Summary of the work to streamline dataset → DB → OSRM → backend setup for
`kathmandu-bus-route-finder` / `my-new-web-app`. No DB schema, Alembic
migrations, or app code changed at any point — this is orchestration and
tooling around the existing pieces.

## Day-to-day commands

From the repo root:

```bash
make setup       # first time only: data clean+validate, db up, migrate,
                  # CSV import, OSRM prep+up
make seed-admin  # interactive -- create an admin login (once)
make up          # build + start the backend (db/osrm already up from setup)

make down        # stop everything
make logs        # docker compose logs -f
```

Re-running a stage on its own (all idempotent / safe to repeat):

```bash
make data        # re-clean raw CSVs into data/processed/
make import      # re-import processed CSVs (fails loudly if DB already
                  # has rows -- see "Known gotcha" below)
make osrm         # re-check/rebuild OSRM car+foot extracts (no-op if
                  # nepal-latest*.osrm already exist)
```

Re-import into a DB that already has data (dev convenience, not the
default -- clears the 6 tables first):

```bash
python data/scripts/import_data.py --processed-dir data/processed --truncate
```

Health check after `make up`:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8000/docs   # expect 200
```

## What changed

**Added:**
- `Makefile` (repo root) — one target per stage, `make setup` for the
  full first-time bootstrap. Targets: `data`, `validate`, `db-up`,
  `backend-env`, `migrate`, `import`, `seed-admin`, `osrm`, `osrm-up`,
  `backend-build`, `up`, `down`, `logs`.
- `data/scripts/import_data.py` — Python/psycopg2 `COPY`-based DB import.
  Same 6 tables, same column order, same sanity checks as the old
  `import.sql` files, but takes `--processed-dir` / `--database-url` as
  arguments instead of a hardcoded path baked into the file. Reads
  `DATABASE_URL` from `backend/.env` by default. `--truncate` flag for
  re-importing into a non-empty dev DB.
- `backend/scripts/prepare_osrm_data.sh` — idempotent OSRM data prep for
  both the car and foot profiles. Skips any stage whose output file
  already exists; uses `osrm-extract --output` to get the foot profile
  under its own name directly (no more `mv nepal-latest.osrm
  nepal-latest-foot.osrm` rename step).
- `scripts/gen_backend_env.py` — creates `backend/.env` from
  `.env.example` with real generated `ADMIN_API_KEY`/`JWT_SECRET_KEY` on
  first run; never overwrites an existing `.env`.

**Removed:**
- `data/import.sql`, `data/import_in_container.sql` — fully superseded by
  `data/scripts/import_data.py`. These required every absolute path
  inside them to be hand-edited per machine/container before each run;
  that's the specific pain point that started this work.

**Docs updated** (root `README.md`, `backend/README.md`, `data/README.md`,
`data/scripts/README.md`, `data/processed/README.md`, plus a couple of
code comments in `data/scripts/clean_data.py` / `validate_clean.py` /
`backend/tests/test_route_finder_api.py` that referenced the old files by
name) — all now point at `make setup` / `import_data.py` instead of the
retired `.sql` files. `backend/README.md` keeps a collapsed
step-by-step manual walkthrough for anyone without `make`/Docker.

## Verification performed

Not just reviewed — actually run, twice: once in a sandboxed clone
against a fresh local Postgres 16 + PostGIS 3.4, and once for real on
`djoker_209`'s machine against the live `docker-compose` stack.

**Sandbox run** (fresh Postgres, real committed data):
- `clean_data.py` against `data/raw/` → 351 stops, 102 routes, 1629
  route_stops, all integrity checks `[OK]`.
- Alembic migrations applied clean through the full chain
  (`0001_initial_schema` → `9d3f1a7c2b4e`).
- `import_data.py` loaded all 6 tables (29 / 351 / 102 / 1629 / 99 / 5
  rows), every sanity check `0` including `stops missing geom: 0`
  (confirms the `trg_stops_set_geom` trigger fires correctly through
  `COPY`, same as `\copy`).
- `--truncate` re-import over an already-populated DB: clean.
- `gen_backend_env.py`: generates real secrets on first run, true no-op
  on re-run.
- `git am` of the resulting patch onto a fresh clone of `main` (`e76298e`):
  applied clean, no conflicts.

**Real run** (`djoker_209`'s machine, `~/Desktop/kathmandu-bus-route-finder`):
- `make setup` ran through data/db/migrate/import/OSRM cleanly, with one
  hiccup (see below).
- `make seed-admin` succeeded first try — admin account `Djoker_209`
  created.
- `make up`: 4/4 containers running (`ktm_bus_db`, `osrm_ktm`,
  `osrm_ktm_foot`, `ktm_bus_backend`) after one hiccup (see below).
- `curl http://localhost:8000/docs` → `200`. Confirmed live.

## Known gotchas hit during rollout (both now resolved on that machine)

1. **`UniqueViolation` on `operators_pkey` during `make import`.** The DB
   already had rows in it (leftover from an earlier manual import) --
   `import_data.py` doesn't truncate by default, same as the old
   `import.sql` never did either, so this isn't a regression, just a
   sharp edge on a non-empty DB. Fix: rerun with `--truncate`.
2. **`address already in use` on port 8000 during `make up`.** A
   `ktm_bus_backend` container was already running (container name is
   fixed in `docker-compose.yml`, so it collides across checkouts of the
   same compose file on one machine). Fix: `docker rm -f ktm_bus_backend`
   then `make up` again.

Neither is a code bug in the new tooling -- both are pre-existing local
state that any setup method (old or new) would have hit.

## Open item / suggestion for later

`import_data.py`'s error message on a `UniqueViolation` against a
non-empty DB is a raw psycopg2 traceback right now. A follow-up could
have it check row counts up front and print a one-line "DB already has
data -- rerun with --truncate" instead. Not done yet -- flagged, not
blocking.
