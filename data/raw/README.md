# Raw Data Sources

This folder holds the unprocessed inputs to the cleaning pipeline documented in
`../processed/report.md`. Each file below is paired with where it came from.

## 1. OSM / Overpass Turbo exports
**Source:** [Overpass Turbo](https://overpass-turbo.eu/) queries against OpenStreetMap,
filtered to `bus`, `microbus`, and `tempo` route/stop tags for the Kathmandu Valley.
**Method:** manual Overpass QL query, exported as raw OSM XML, then converted
to CSV for the cleaning pipeline.
**Files:**
- `overpass_export_2026-07-11_1331.osm`, `overpass_export_2026-07-11_1335.osm`
  — raw Overpass XML exports (2026-07-11)
- `stops_production_v2.csv` — stop locations, names, tags (converted from the
  exports above)
- `route_stops_production_v2.csv` — stop sequences per route
- `routes_production_v2_fixed.csv` — route geometries/metadata

## 2. 2013 Yatayat (neogeomat.github.io/yatayat)
**Source:** [Kathmandu Public Transport](https://neogeomat.github.io/yatayat/) —
a community mapping project by Kathmandu University Geomatics and the Monsoon
Collective, built on OSM data with a Leaflet routing UI and fare reference page.
**Method:** exported/scraped route and fare listings from the site.
**Files:**
- `yatayat_export.osm` — the underlying 2013 OSM export (`osm_base` timestamp
  2013-08-07) the Yatayat project was built on
- Cross-referenced against `routes_production_v2_fixed.csv` and
  `route_stops_production_v2.csv` for route naming and continuity

## 3. DOTM (Department of Transport Management) records
**Source:** Nepal DOTM operator/route registration records.
**Method:** manual transcription / public dataset 
**Files:**
- `operators.csv` — registered transport operator/company details
- `route_operators_production.csv` — operator-to-route assignments


## Notes
- Files above are the pre-cleaning originals. See `../processed/report.md` for
  the orphan-pair audit and cleanup applied to produce `../processed/*_clean.csv`.
- Collection dates and exact Overpass QL queries are not yet recorded — add them
  here if you still have them, since OSM data changes over time and future
  reproducibility depends on knowing the export date.
