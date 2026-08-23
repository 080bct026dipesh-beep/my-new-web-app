"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import SearchForm from "@/components/search/SearchForm";
import CongestionPanel from "@/components/CongestionPanel";
import RouteResultPanel from "@/components/route/RouteResultPanel";
import { Stop, StopPickTarget } from "@/types/route";
import { buildStopLabel } from "@/lib/stopLabel";
import { getStop } from "@/lib/api";
import { useStops } from "@/hooks/useStops";
import { useGeolocation } from "@/hooks/useGeolocation";
import { useRouteSearch } from "@/hooks/useRouteSearch";
import { useCongestion } from "@/hooks/useCongestion";
import { useRouteBrowser } from "@/hooks/useRouteBrowser";

// Leaflet touches `window`, so the map must load client-side only.
const BusMap = dynamic(() => import("@/components/BusMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink-secondary">
      Loading map…
    </div>
  ),
});

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ transform: direction === "up" ? "rotate(180deg)" : undefined }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

// Persisted so a minimized panel stays minimized across reloads -- same
// rationale as NavBar's minimize toggle (components/layout/NavBar.tsx),
// which uses the same storage-key naming scheme.
const SIDEBAR_STORAGE_KEY = "ktm-transit:search-panel-minimized";

export default function Home() {
  return (
    // useSearchParams() below opts this page out of static prerendering
    // unless wrapped in Suspense -- the fallback never actually shows in
    // practice since this is a fully client-rendered page, but Next.js
    // requires the boundary to exist.
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const { stops, loading: stopsLoading, error: stopsError } = useStops();

  // Origin/destination text lives here (not inside SearchForm) so both the
  // form and a map click can write to it.
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [pickTarget, setPickTarget] = useState<StopPickTarget>(null);

  const { userLocation, nearestStop, walkingRoute, locating, locateError, useMyLocation } =
    useGeolocation({
      stops,
      // Offer the detected stop as the origin, but only if the user hasn't
      // already typed/picked something themselves.
      onStopFound: (label) => setOriginText((prev) => prev || label),
    });

  const { result, loading, error, search } = useRouteSearch();

  // Which result is currently shown: -1 = primary/recommended, otherwise an
  // index into result.alternatives. Lives here (not inside
  // RouteResultPanel) so the selection also drives what BusMap draws --
  // previously the alternative buttons only changed the sidebar timeline,
  // leaving the map stuck on the primary route. Reset to -1 whenever a new
  // search result comes in, via React's "adjust state during render"
  // pattern (https://react.dev/learn/you-might-not-need-an-effect) rather
  // than an effect -- each search produces a fresh `result` reference, so
  // comparing against a tracked previous value lets this bail out cleanly.
  const [selectedAltIndex, setSelectedAltIndex] = useState(-1);
  const [lastResultForSelection, setLastResultForSelection] = useState(result);
  if (lastResultForSelection !== result) {
    setLastResultForSelection(result);
    if (selectedAltIndex !== -1) setSelectedAltIndex(-1);
  }

  // The result BusMap actually draws: the primary result as-is, or the
  // primary result with its legs swapped for the selected alternative's
  // (alternatives don't carry fare/origin/destination of their own -- only
  // legs/total_cost/transfer_count differ -- so everything else about the
  // result stays the same).
  const mapResult =
    result && result.found && selectedAltIndex !== -1
      ? { ...result, ...result.alternatives[selectedAltIndex] }
      : result;

  const congestion = useCongestion();
  // Used only for the ?route= deep link from /routes/[routeId]'s "View on
  // map" action (see the effect below) and to feed browseRouteStops to
  // BusMap -- the browsing UI itself (search/paginate/toggle-visible)
  // lives on the dedicated /routes page now, not duplicated here.
  const routeBrowser = useRouteBrowser();

  // Minimize/restore for the search sidebar -- lets someone collapse the
  // whole From/To panel down to a thin strip to see the full map (most
  // useful once a route is already found and they just want to look
  // around it). Same deferred-read-from-localStorage pattern as NavBar's
  // minimize toggle, to avoid a hydration mismatch (server has no
  // localStorage) while still avoiding a synchronous setState call inside
  // the effect body.
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [sidebarHydrated, setSidebarHydrated] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSidebarMinimized(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1");
      setSidebarHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function toggleSidebarMinimized() {
    const next = !sidebarMinimized;
    setSidebarMinimized(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable (private browsing, quota) -- the toggle still
      // works for this session, it just won't persist across reloads.
    }
  }

  // Only collapse visually once hydrated -- otherwise a previously-
  // minimized panel would flash open on every load before the effect
  // above catches up.
  const showMinimized = sidebarMinimized && sidebarHydrated;

  // One-time deep-link handling: /stops/[id] links here with
  // ?origin=<stop_id> or ?destination=<stop_id> (its "Set as From/To"
  // actions), and /routes/[id] links here with ?route=<route_id> (its
  // "View on map" action). Applied once on mount via a ref guard --
  // afterwards the URL params are stale and shouldn't fight with the
  // user's own edits.
  const searchParams = useSearchParams();
  const appliedDeepLinkRef = useRef(false);
  useEffect(() => {
    if (appliedDeepLinkRef.current) return;
    const originId = searchParams.get("origin");
    const destinationId = searchParams.get("destination");
    const routeId = searchParams.get("route");
    if (!originId && !destinationId && !routeId) return;
    appliedDeepLinkRef.current = true;

    if (originId) {
      getStop(originId)
        .then((stop) => setOriginText(buildStopLabel(stop, stops)))
        .catch(() => {
          /* bad/stale id in the URL -- leave the field blank rather than erroring */
        });
    }
    if (destinationId) {
      getStop(destinationId)
        .then((stop) => setDestinationText(buildStopLabel(stop, stops)))
        .catch(() => {
          /* bad/stale id in the URL -- leave the field blank rather than erroring */
        });
    }
    if (routeId) {
      routeBrowser.showRouteById(routeId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleStopPick(stop: Stop) {
    // Same disambiguation as the geolocation flow -- a bare stop_name
    // would break SearchForm's resolveStop() for any name that isn't
    // unique.
    const label = buildStopLabel(stop, stops);
    if (pickTarget === "origin") {
      setOriginText(label);
    } else if (pickTarget === "destination") {
      setDestinationText(label);
    }
    setPickTarget(null); // one pick and done, same as most map apps
  }

  return (
    <main className="flex h-full w-full flex-col md:flex-row">
      <aside
        className={`flex w-full flex-col overflow-y-auto border-b border-route-line bg-surface transition-[max-width,padding] md:h-full md:border-b-0 md:border-r ${
          showMinimized ? "gap-0 p-2 md:max-w-[52px]" : "gap-5 p-4 md:max-w-sm"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          {!showMinimized && (
            <div>
              <h1 className="text-xl font-semibold leading-tight tracking-tight">
                <span className="text-accent-blue">Plan</span>{" "}
                <span className="text-accent-purple">your journey</span>
              </h1>
              <p className="mt-1 text-sm text-ink-secondary">
                Kathmandu Valley public transit navigator — direct or single-transfer routes.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebarMinimized}
            aria-label={showMinimized ? "Restore search panel" : "Minimize search panel"}
            title={showMinimized ? "Restore search panel" : "Minimize search panel"}
            className="flex flex-shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-ink-secondary hover:text-ink"
          >
            <ChevronIcon direction={showMinimized ? "down" : "up"} />
          </button>
        </div>

        {!showMinimized && (
          <>
            <SearchForm
              stops={stops}
              stopsLoading={stopsLoading}
              onSearch={search}
              loading={loading}
              originText={originText}
              destinationText={destinationText}
              onOriginTextChange={setOriginText}
              onDestinationTextChange={setDestinationText}
              pickTarget={pickTarget}
              onPickTargetChange={setPickTarget}
              locating={locating}
              locateError={locateError}
              onUseMyLocation={useMyLocation}
            />

            <CongestionPanel
              enabled={congestion.enabled}
              onToggle={congestion.toggle}
              dayOfWeek={congestion.dayOfWeek}
              hourBucket={congestion.hourBucket}
              onDayChange={congestion.setDayOfWeek}
              onHourChange={congestion.setHourBucket}
              loading={congestion.loading}
              segmentCount={congestion.segments.length}
              hasSeededOnly={congestion.hasSeededOnly}
            />

            {stopsError && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                Couldn&apos;t load the stop list from the server. You can still search if you know
                exact stop names, but suggestions won&apos;t be available.
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="ml-2 font-medium text-amber-800 underline"
                >
                  Retry
                </button>
              </p>
            )}

            <RouteResultPanel
              result={result}
              loading={loading}
              error={error}
              selectedIndex={selectedAltIndex}
              onSelectedIndexChange={setSelectedAltIndex}
            />
          </>
        )}
      </aside>

      <div className="min-h-[50vh] flex-1 md:min-h-0">
        <BusMap
          key="bus-map"
          result={mapResult}
          allStops={stops}
          pickTarget={pickTarget}
          onStopPick={handleStopPick}
          userLocation={userLocation}
          walkingRoute={walkingRoute}
          nearestStop={nearestStop}
          congestionSegments={congestion.enabled ? congestion.segments : []}
          browseRouteStops={routeBrowser.visibleRouteStops}
          browseRouteGeometry={routeBrowser.visibleRouteGeometry}
        />
      </div>
    </main>
  );
}
