"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import SearchForm from "@/components/SearchForm";
import { LatLng, RouteSearchResult, Stop, StopPickTarget, WalkingRoute } from "@/types/route";

// Leaflet touches `window`, so the map must load client-side only.
const BusMap = dynamic(() => import("@/components/BusMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
      Loading map…
    </div>
  ),
});

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} hr` : `${hours} hr ${remaining} min`;
}

export default function Home() {
  const [stops, setStops] = useState<Stop[]>([]);
  const [stopsLoading, setStopsLoading] = useState(true);
  const [stopsError, setStopsError] = useState(false);
  const [result, setResult] = useState<RouteSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Origin/destination text lives here (not inside SearchForm) so both the
  // form and a map click can write to it.
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [pickTarget, setPickTarget] = useState<StopPickTarget>(null);

  // Auto-detected location + walk-to-nearest-stop path.
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [nearestStop, setNearestStop] = useState<Stop | null>(null);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  // Given a location, find + store the nearest stop and the walking path to
  // it. Shared by the automatic on-load detect and the manual "Use my
  // location" button so they behave identically.
  const locateNearestStop = useCallback(async (lat: number, lng: number) => {
    setUserLocation({ lat, lng });
    try {
      const params = new URLSearchParams({ lat: String(lat), lng: String(lng), limit: "1" });
      const res = await fetch(`${API_BASE}/stops/nearby?${params.toString()}`);
      if (!res.ok) throw new Error();
      const nearby: Stop[] = await res.json();
      if (nearby.length === 0) {
        setLocateError("No stops found near your location.");
        return;
      }
      const stop = nearby[0];
      setNearestStop(stop);

      try {
        const walkParams = new URLSearchParams({
          from_lat: String(lat),
          from_lng: String(lng),
          to_lat: String(stop.lat),
          to_lng: String(stop.lng),
        });
        const walkRes = await fetch(`${API_BASE}/walking-route?${walkParams.toString()}`);
        // Walking directions are a nice-to-have (needs a foot-profile OSRM
        // instance running); BusMap falls back to a straight line if this
        // 404s/502s, so just leave walkingRoute null rather than surfacing
        // an error.
        if (walkRes.ok) {
          setWalkingRoute(await walkRes.json());
        } else {
          setWalkingRoute(null);
        }
      } catch {
        setWalkingRoute(null);
      }
    } catch {
      setLocateError("Couldn't find a nearby stop. Try again.");
    }
  }, []);

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await locateNearestStop(position.coords.latitude, position.coords.longitude);
        setLocating(false);
      },
      () => {
        setLocateError("Location permission denied.");
        setLocating(false);
      },
      { timeout: 8000 }
    );
  }

  // Auto-detect location once on load. This only asks for permission (the
  // browser's native prompt) -- it never overwrites text the user already
  // typed, and a denial is treated as a silent no-op rather than an error
  // message on a page they haven't interacted with yet.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locateNearestStop(position.coords.latitude, position.coords.longitude);
      },
      () => {
        /* permission denied or unavailable -- fine, "Use my location" is still there */
      },
      { timeout: 8000 }
    );
  }, [locateNearestStop]);

  // Once we know the nearest stop, offer it as the origin -- but only if
  // the user hasn't already typed/picked something themselves.
  useEffect(() => {
    if (nearestStop && !originText) {
      setOriginText(nearestStop.stop_name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearestStop]);

  function handleStopPick(stop: Stop) {
    if (pickTarget === "origin") {
      setOriginText(stop.stop_name);
    } else if (pickTarget === "destination") {
      setDestinationText(stop.stop_name);
    }
    setPickTarget(null); // one pick and done, same as most map apps
  }

  // Load the full stop list for the autocomplete datalist, paging through
  // /stops since `limit` is capped server-side by settings.MAX_PAGE_SIZE.
  useEffect(() => {
    async function loadStops() {
      try {
        const all: Stop[] = [];
        let offset = 0;
        const pageSize = 100; // stays under MAX_PAGE_SIZE regardless of its exact value

        while (true) {
          const res = await fetch(`${API_BASE}/stops?limit=${pageSize}&offset=${offset}`);
          if (!res.ok) {
            setStopsError(true);
            break;
          }
          const data: { total: number; items: Stop[] } = await res.json();
          all.push(...data.items);
          offset += pageSize;
          if (offset >= data.total || data.items.length === 0) break;
        }

        setStops(all);
      } catch {
        // Search still works if the user knows a stop_id, but the
        // autocomplete/"use my location" affordances need this list.
        setStopsError(true);
      } finally {
        setStopsLoading(false);
      }
    }
    loadStops();
  }, []);

  async function handleSearch(originId: string, destinationId: string) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({
        origin: originId,
        destination: destinationId,
      });
      const res = await fetch(`${API_BASE}/route-finder?${params.toString()}`);

      if (res.status === 404) {
        setResult({ found: false });
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Try again.");
        return;
      }

      const data = await res.json();
      setResult({ found: true, ...data });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Only meaningful if every leg has road geometry (OSRM succeeded for all of them).
  const totalDurationS =
    result?.found && result.legs.every((leg) => leg.road_geometry)
      ? result.legs.reduce((sum, leg) => sum + (leg.road_geometry?.duration_s ?? 0), 0)
      : null;

  return (
    <main className="flex h-screen w-screen flex-col md:flex-row">
      <aside className="flex w-full flex-col gap-4 overflow-y-auto border-b border-route-line p-4 md:h-full md:max-w-sm md:border-b-0 md:border-r">
        <div>
          <h1 className="text-lg font-semibold">Kathmandu Bus Route Finder</h1>
          <p className="text-sm text-neutral-400">
            Find a direct or single-transfer bus route across the Valley.
          </p>
        </div>

        <SearchForm
          stops={stops}
          stopsLoading={stopsLoading}
          onSearch={handleSearch}
          loading={loading}
          originText={originText}
          destinationText={destinationText}
          onOriginTextChange={setOriginText}
          onDestinationTextChange={setDestinationText}
          pickTarget={pickTarget}
          onPickTargetChange={setPickTarget}
          locating={locating}
          locateError={locateError}
          onUseMyLocation={handleUseMyLocation}
        />

        {stopsError && (
          <p className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
            Couldn&apos;t load the stop list from the server. You can still search if you know
            exact stop names, but suggestions won&apos;t be available.
          </p>
        )}

        <div aria-live="polite" className="flex flex-col gap-2">
          {error && (
            <p className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}

          {result && !result.found && (
            <p className="rounded-md bg-route-panel px-3 py-2 text-sm text-neutral-300">
              No direct or single-transfer route found between those stops.
            </p>
          )}

          {result && result.found && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-neutral-400">
                {result.transfer_count === 0
                  ? "Direct route"
                  : `${result.transfer_count} transfer${result.transfer_count > 1 ? "s" : ""}`}
                {" · "}
                {(result.total_cost / 1000).toFixed(1)} km
                {totalDurationS !== null && <> · ~{formatDuration(totalDurationS)}</>}
              </p>
              {result.legs.map((leg, i) => {
                const isWalk = leg.route_id === "TRANSFER";
                return (
                  <div
                    key={`${leg.route_id}-${i}`}
                    className="flex items-start gap-2 rounded-md bg-route-panel px-3 py-2"
                  >
                    <span
                      className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor: isWalk
                          ? "#9CA3AF"
                          : LEG_COLORS[i % LEG_COLORS.length],
                      }}
                      aria-hidden
                    />
                    <div>
                      <p className="font-medium">{leg.route_name}</p>
                      <p className="text-neutral-400">
                        {leg.board_stop.stop_name} → {leg.alight_stop.stop_name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!result && !error && (
            <p className="text-sm text-neutral-500">
              Pick a starting stop and a destination, then hit Find route to see it on the map.
            </p>
          )}
        </div>
      </aside>

      <div className="min-h-[50vh] flex-1 md:min-h-0">
        <BusMap
          key="bus-map"
          result={result}
          allStops={stops}
          pickTarget={pickTarget}
          onStopPick={handleStopPick}
          userLocation={userLocation}
          walkingRoute={walkingRoute}
          nearestStop={nearestStop}
        />
      </div>
    </main>
  );
}

// Kept in sync with LEG_COLORS in components/BusMap.tsx so the legend in
// the sidebar matches the polylines drawn on the map.
const LEG_COLORS = ["#3DDC97", "#F2A93B", "#5DA9E9", "#E06C75"];