-- Kathmandu Bus Route Finder — Normalized schema (REFERENCE COPY)
-- Scrum 1: stops, routes, route_stops + PostGIS spatial indexes
--
-- NOTE: The source of truth is now backend/migrations/versions/0001_initial_schema.py
-- (Alembic). This file is kept as a plain-SQL reference for quick reading / manual
-- psql inspection. If you change the schema, update the Alembic migration, then
-- regenerate this file to match (or just delete this file to avoid drift).

CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- stops
-- ============================================================
CREATE TABLE IF NOT EXISTS stops (
    stop_id         SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    name_normalized VARCHAR(150) NOT NULL,       -- lowercase, trimmed, for dedup/search
    is_interchange  BOOLEAN NOT NULL DEFAULT FALSE,
    geom            GEOMETRY(Point, 4326) NOT NULL,
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stops_geom ON stops USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_stops_name_normalized ON stops (name_normalized);

-- ============================================================
-- routes
-- ============================================================
CREATE TABLE IF NOT EXISTS routes (
    route_id        SERIAL PRIMARY KEY,
    route_number    VARCHAR(20) NOT NULL,
    route_name      VARCHAR(150) NOT NULL,
    operator        VARCHAR(100),
    tier            SMALLINT CHECK (tier IN (1, 2, 3)),   -- Tier 1/2/3 per proposal Sec 5.5.1
    verified        BOOLEAN NOT NULL DEFAULT FALSE,
    source          VARCHAR(50),                          -- e.g. 'DOTM', 'OSM', 'field_survey'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routes_tier ON routes (tier);
CREATE INDEX IF NOT EXISTS idx_routes_verified ON routes (verified);

-- ============================================================
-- route_stops (join table — ordered stop sequence per route)
-- ============================================================
CREATE TABLE IF NOT EXISTS route_stops (
    route_id        INTEGER NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE,
    stop_id         INTEGER NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
    sequence_order  INTEGER NOT NULL,                     -- 1-indexed position along the route
    PRIMARY KEY (route_id, sequence_order)
);

CREATE INDEX IF NOT EXISTS idx_route_stops_route_id ON route_stops (route_id);
CREATE INDEX IF NOT EXISTS idx_route_stops_stop_id ON route_stops (stop_id);

-- Ensures a stop can't repeat at two different positions on the same route
CREATE UNIQUE INDEX IF NOT EXISTS uq_route_stop_position
    ON route_stops (route_id, stop_id, sequence_order);
