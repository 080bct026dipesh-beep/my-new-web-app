# Data
(schema, ingestion, cleaning, spatial queries, data access layer)

```
data/
├── raw/          Original exports
│                   - 2013 Yatayat OSM export
│                   - Overpass Turbo pulls
│                   - DOTM records
│
├── processed/    Cleaned, validated CSVs ready for DB import
│                   (see processed/README.md)
│
└── scripts/      Data-cleaning and validation pipeline
                    - clean_data.py    — raw/ → processed/
                    - validate_clean.py — post-cleaning integrity checks
                    - test_clean_data.py — unit tests
                    - requirements.txt
```

## Pipeline order

1. **`scripts/clean_data.py`** — `raw/` → `processed/`
   Turns raw exports into validated CSVs and regenerates
   `processed/report.md` documenting exactly what changed:
     1. Removes `route_stops` rows referencing a `stop_id` with no matching
        row in `stops`
     2. Re-sequences `route_stops.sequence_no` per route after removals
        (1..N)
     3. Recomputes `routes.start_stop_id` / `end_stop_id` / `total_stops`
        from `route_stops`
     4. Nulls out `routes.operator_id` where it has no match in `operators`
        and isn't recoverable from `operator_id_raw` or `route_operators`
     5. Flags distance outliers (haversine vs. recorded
        `approx_distance_km`)
     6. Verifies `route_operators`/`operators` have no orphan pairs
     7. Runs the same post-cleanup integrity checks `import.sql` runs in
        Postgres

```bash
   python scripts/clean_data.py \
       --raw-dir data/raw \
       --out-dir data/processed \
       --config scripts/config.yaml   # optional
```

2. **`scripts/validate_clean.py`** — integrity checks on `processed/*.csv`,
   no database required. Runs the same checks as the sanity-check block at
   the bottom of `import.sql`, so problems can be caught in CI before ever
   touching Postgres.

```bash
   python scripts/validate_clean.py --dir data/processed
   # exits 1 and prints failures if any check is non-zero
```

3. **`schema.sql`** — builds the full schema (6 tables: `operators`,
   `stops`, `routes`, `route_stops`, `route_operators`, `fare_rules`)
   against the app's PostgreSQL + PostGIS instance (`postgis/postgis:15-3.4`
   per `docker-compose.yml` and CI). Applied via Alembic migration
   `0002_replace_with_full_schema` in the backend's migration chain, so the
   live app DB and this file stay in sync going forward. An auxiliary
   `route_return_leg_priority` QA table existed for a time but was dropped
   in a later migration (`b3c9d1e4c6a7`) and is no longer part of the schema.

4. **`import.sql`** — loads all `processed/*_clean.csv` files directly via
   `\copy` into the schema from step 3, in dependency order (operators →
   stops → routes → route_stops → route_operators → fare_rules), followed
   by a built-in referential-integrity sanity check — all currently passing
   clean.

   > **Before running:** paths inside `import.sql` are placeholders
   > (`/path/to/csv/`). Replace with your local absolute path to
   > `processed/` first.

---

## Current dataset status

| Table              | Row count |
|--------------------|-----------|
| `routes`           | 93        |
| `stops`             | 313       |
| `operators`         | 29        |
| `route_stops`       | 1,680     |
| `route_operators`   | 86        |
| `fare_rules`        | 5         |

All of the above are confirmed loaded successfully into a live
PostgreSQL 15 + PostGIS 3.4 instance (matching `docker-compose.yml`/CI) via
`import.sql`. `data/processed/README.md` lists PostgreSQL 16.14 as the
version tested against for the standalone import path — see the note there;
the app's own database (Docker/CI) currently runs PostgreSQL 15.

**Referential-integrity audit** — passed clean end-to-end:
  - `route_stops → stops` orphan check: **0**
  - `route_stops → routes` orphan check: **0**
  - `route_operators → operators` orphan check: **0**
  - `routes.total_stops` vs. actual `route_stops` count: **0 mismatches**
  - `stops` rows missing `geom`: **0**

  See `processed/README.md` and `report_v4.md` for the full audit trail.

**Fare rules** — 5 distance bands, confirmed non-overlapping (enforced by
the `EXCLUDE USING gist` constraint) and correctly computed as
`[min_distance_km, max_distance_km)`.
  > Note: all 5 rows are currently `desk_estimate_2026-08` — scaled from a
  > prior Bagmati Province rate, pending confirmation against the official
  > gazette notice. **Not yet field-verified.**

**Field verification status** — not re-assessed this round.
  <!-- TODO: replace with current Tier 1/2/3 breakdown -->
  Field verification status — not re-assessed this round.

**Unresolved operator matches** — none currently. All routes have a
resolved `operator_id` as of the latest cleaned dataset.
