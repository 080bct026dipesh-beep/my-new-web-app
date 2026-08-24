# Test Coverage & CI — Audit Follow-Up

This documents the work done to close three gaps flagged in an internal
audit: missing backend coverage for the admin-auth and fare endpoints,
no CI coverage for the data pipeline, and no frontend tests at all.

## Audit finding #2 — Backend test coverage gaps

Three new self-contained test files under `backend/tests/`, each creating
and tearing down its own fixtures rather than depending on the shipped
dataset:

- **`test_admin_auth_api.py`** — `POST /admin/login`: success, wrong
  password, unknown username, timing-safe error parity between the two
  failure cases, empty password; a direct test of `get_current_admin()`
  (the JWT-decode dependency that exists but isn't wired to any route
  yet); and the 5/minute rate limit actually tripping on the 6th attempt
  within a window.
- **`test_fare_api.py`** — `GET /fare` band matching, inclusive-min /
  exclusive-max boundary behavior, 404 when no band covers the distance,
  and validation errors.
- **`test_admin_crud_api.py`** — `POST /stops`, `POST /routes`, and
  `POST /routes/{id}/stops`: auth enforcement, 404s for unknown
  stop/route references, the 409 conflict on duplicate `sequence_no`,
  and confirming `add_route_stop` bumps `graph_meta.version`.

26 new tests. Full backend suite: 75 passed (4 pre-existing failures need
the full seeded dataset and are unrelated to this change).

## Audit finding #4 — No CI coverage for the data pipeline

A new `data-pipeline-tests` job in `.github/workflows/ci.yml`: installs
`data/scripts/requirements.txt`, runs `test_clean_data.py`, then runs
`clean_data.py --fail-on-verify-error` and `validate_clean.py` against
the committed raw data. This closes the exact gap that previously let a
`dedup_routes()` regression sit undetected.

## Audit finding #3 — Frontend has no tests

Vitest, jsdom, and React Testing Library, using the native Vite
tsconfig-paths resolver (matches `tsconfig.json`'s `@/*` alias):

- **`lib/routeDistance.test.ts`, `lib/stopLabel.test.ts`** — pure-function
  coverage, including a regression guard that `bestRouteDistanceKm` uses
  `??` (not `||`) so a real 0km OSRM distance isn't dropped in favor of
  `approx_distance_km`.
- **`lib/api.test.ts`** — the fetch wrapper's four `ApiError` kinds
  (http, network, timeout-shaped, parse), `qs()` query building,
  `getAllStops`'s pagination (single page and multi-page-in-parallel),
  and `findRoute`'s 404-is-not-an-error special case.
- **`hooks/useStops.test.ts`, `hooks/useRouteSearch.test.ts`** —
  loading/error/result state via `renderHook` with `lib/api` mocked,
  including a regression guard for `useRouteSearch`'s `requestIdRef`
  race guard (a slower superseded search must not clobber a faster
  later one) and `reset()` during an in-flight request.

31 tests, all passing. `npm run lint` and `npm run build` verified
unaffected. `npm test` / `npm run test:watch` scripts added; CI's
`frontend-checks` job now runs `npm test` between lint and build.
`CONTRIBUTING.md`'s `npm test --if-present` (which ran nothing before
this, since the script didn't exist) is now a plain `npm test`.

## Where to look

| Area | Files |
|---|---|
| Backend admin/fare tests | `backend/tests/test_admin_auth_api.py`, `test_fare_api.py`, `test_admin_crud_api.py` |
| Data pipeline CI | `.github/workflows/ci.yml` (`data-pipeline-tests` job) |
| Frontend tests | `frontend/lib/*.test.ts`, `frontend/hooks/*.test.ts`, `frontend/vitest.config.mts` |

See the root `README.md`'s [Testing](../README.md#testing) section and
`backend/README.md` / `frontend/README.md` for how to run each suite.
