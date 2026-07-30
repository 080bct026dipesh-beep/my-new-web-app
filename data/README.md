# Data

Owner: Dipesh S Saud — Scrum tasks 1-8 (schema, ingestion, cleaning, spatial queries, data access layer).

```
data/
├── raw/          Original exports (2013 Yatayat OSM export, Overpass Turbo pulls, DOTM records)
├── processed/    Cleaned, deduplicated, validated CSV/JSON ready for DB import
└── scripts/      ETL scripts: dedup (~30m threshold), coordinate validation, name normalization
```

## Pipeline order

1. `scripts/import_raw.py` — load raw OSM/DOTM exports
2. `scripts/dedupe_stops.py` — merge stops within ~30m (Scrum 3)
3. `scripts/validate_coords.py` — reject out-of-bounds coordinates (Scrum 3)
4. `scripts/normalize_names.py` — lowercase/trim stop & route names for matching
5. `scripts/load_to_db.py` — insert into `stops`, `routes`, `route_stops` (uses `backend/app/db/schema.sql`)

## Current dataset status

- 57 verified routes, 206 stops (Tier 1 + Tier 2 complete; Tier 3 in progress — 13 routes pending field verification)
