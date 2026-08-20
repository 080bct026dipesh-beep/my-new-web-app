# Frontend (Next.js + TypeScript + Leaflet)

Search for a stop-to-stop bus route across the Kathmandu Valley and see it
drawn on an interactive map, with live data from the FastAPI backend.

## Tech

Next.js 16 (App Router), React 18, TypeScript, Tailwind CSS, Leaflet.js via
`react-leaflet`.

## Running locally

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:3000. By default the app talks to the backend at
`http://localhost:8000` — override this with an env var if your backend runs
elsewhere:

```bash
# frontend/.env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### Production build

```bash
npm run build
npm run start
```

## What's here

- `app/page.tsx` — top-level layout, stop-list loading, geolocation
  ("Use my location") handling, and the `/route-finder` search flow.
- `components/SearchForm.tsx` — origin/destination inputs with autocomplete,
  a swap button, and a "Use my location" button backed by `/stops/nearby`.
- `components/BusMap.tsx` — imperative Leaflet map: draws each route leg as a
  colored polyline (dashed for walking transfers), with distinct markers for
  the trip's origin, destination, and any transfer points, road-following
  geometry from OSRM when available, a historical traffic-congestion overlay
  (colored by `congestion_level` from `/congestion`), and a legend.
- `components/RoutesPanel.tsx` — renders the found route's legs (ride vs.
  walking transfer) as a readable list alongside the map.
- `components/CongestionPanel.tsx` — toggle for the congestion overlay, with
  day-of-week/hour-bucket pickers (defaults to "now" in Nepal time) that call
  `/congestion`.
- `types/route.ts` — mirrors `backend/app/schemas.py`. Keep in sync if the
  backend's response shapes change.

## Notes

- The map only renders client-side (`next/dynamic` with `ssr: false`), since
  Leaflet touches `window`.
- `SearchForm` resolves typed stop names to `stop_id`s via the loaded stop
  list — the `<datalist>` autocomplete is a soft suggestion, so submitting a
  name that doesn't match one of the suggestions surfaces an inline error
  rather than hitting the API with garbage.
- Backend "no route found" is a 404, so the frontend adds a client-side
  `found: boolean` to distinguish "no route" from a real error.
- "Use my location" uses the browser Geolocation API, then calls
  `/stops/nearby` to offer nearby stops and `/walking-route` to draw the
  walking path to the selected one.
