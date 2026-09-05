"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import SearchForm, { ViaStopField } from "@/components/search/SearchForm";
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
import { ChevronIcon, LayersIcon } from "@/components/icons/TransitIcons";
import { clampDragHeightPx, nearestSnap, parseStoredSnap, SheetSnap, snapHeightPx } from "@/lib/sheetSnap";

// Leaflet touches `window`, so the map must load client-side only.
const BusMap = dynamic(() => import("@/components/BusMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-ink-secondary">
      Loading map…
    </div>
  ),
});

// Persisted so a minimized/half/full panel stays that way across reloads
// -- same rationale as NavBar's minimize toggle
// (components/layout/NavBar.tsx), which uses the same storage-key naming
// scheme. Stores a SheetSnap string now; parseStoredSnap (lib/sheetSnap.ts)
// still reads the older binary "1"/"0" format for anyone with a
// previously-stored value.
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
  const [viaStops, setViaStops] = useState<ViaStopField[]>([]);
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

  // Bottom-sheet state for the mobile search panel: three snap points
  // (minimized/half/full -- lib/sheetSnap.ts) reachable either by
  // dragging the handle or, for keyboard/non-pointer users, the chevron
  // button (which only ever toggles minimized<->full -- "half" is a
  // drag-only enhancement on top of that, not a replacement for it).
  // Persisted the same deferred-read-from-localStorage way as NavBar's
  // minimize toggle, to avoid a hydration mismatch.
  const [sheetSnap, setSheetSnapState] = useState<SheetSnap>("full");
  const [sidebarHydrated, setSidebarHydrated] = useState(false);
  // Live height while actively dragging, in px; null when not dragging
  // (in which case the snap's own height applies via CSS, with a
  // transition). Kept as plain state rather than a ref since it needs to
  // repaint on every pointermove.
  const [dragHeightPx, setDragHeightPx] = useState<number | null>(null);
  const dragStartRef = useRef<{ startY: number; startHeightPx: number } | null>(null);

  // window.innerHeight doesn't exist during SSR and differs from the
  // client's actual viewport on first paint, so it can't be read directly
  // in render (that's exactly what caused a hydration mismatch here --
  // server always computed against a literal fallback while the client's
  // very first render, before this effect runs, computed against the
  // real value). Same deferred-read pattern as sidebarHydrated above:
  // render with a fixed default on both server and the client's first
  // pass, then swap to the real value once mounted. Also kept live on
  // resize/orientation-change so the sheet's snap heights track the
  // current viewport rather than whatever it was on load.
  const [viewportHeight, setViewportHeight] = useState(800);
  useEffect(() => {
    const updateViewportHeight = () => setViewportHeight(window.innerHeight);
    updateViewportHeight();
    window.addEventListener("resize", updateViewportHeight);
    return () => window.removeEventListener("resize", updateViewportHeight);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSheetSnapState(parseStoredSnap(window.localStorage.getItem(SIDEBAR_STORAGE_KEY)));
      setSidebarHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function setSheetSnap(next: SheetSnap) {
    setSheetSnapState(next);
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private browsing, quota) -- the toggle still
      // works for this session, it just won't persist across reloads.
    }
  }

  function toggleSidebarMinimized() {
    setSheetSnap(sheetSnap === "minimized" ? "full" : "minimized");
  }

  function handleHandlePointerDown(e: React.PointerEvent<HTMLSpanElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { startY: e.clientY, startHeightPx: snapHeightPx(sheetSnap, viewportHeight) };
  }

  function handleHandlePointerMove(e: React.PointerEvent<HTMLSpanElement>) {
    if (!dragStartRef.current) return;
    const draggedUpBy = dragStartRef.current.startY - e.clientY;
    setDragHeightPx(
      clampDragHeightPx(dragStartRef.current.startHeightPx + draggedUpBy, viewportHeight)
    );
  }

  function handleHandlePointerUp() {
    if (dragHeightPx != null) {
      setSheetSnap(nearestSnap(dragHeightPx, viewportHeight));
    }
    setDragHeightPx(null);
    dragStartRef.current = null;
  }

  // Only collapse visually once hydrated -- otherwise a previously-
  // minimized panel would flash open on every load before the effect
  // above catches up. Content visibility follows the committed snap, not
  // the live drag height, so the form doesn't flicker in/out mid-drag.
  const showMinimized = sheetSnap === "minimized" && sidebarHydrated;
  const liveHeightPx = dragHeightPx ?? snapHeightPx(sidebarHydrated ? sheetSnap : "full", viewportHeight);

  // All-stops map layer: on by default (so map-click stop-picking works
  // out of the box), independent of the automatic dimming BusMap applies
  // once a route is found -- this is the explicit override for someone
  // who wants the layer fully off regardless.
  const [showAllStops, setShowAllStops] = useState(true);

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
    <main className="relative flex h-full w-full flex-col md:flex-row">
      {/* Mobile: full-screen map under the navbar, with the planner floating
          as a bottom sheet on top. Desktop: the classic two-column layout
          (planner column left, map fills the rest) -- see the suggested
          structure in the redesign brief. */}
      <aside
        className={`absolute inset-x-0 bottom-0 z-[500] flex flex-col overflow-y-auto rounded-t-2xl border border-route-line bg-surface-raised shadow-sheet md:static md:inset-auto md:z-auto md:h-full md:w-full md:max-w-sm md:rounded-none md:border-b-0 md:border-l-0 md:border-r md:shadow-none md:max-h-none max-h-[var(--sheet-height)] ${
          dragHeightPx == null ? "transition-[max-height,padding]" : ""
        } ${showMinimized ? "gap-0 p-2 md:max-w-[52px]" : "gap-5 p-4"}`}
        style={{ "--sheet-height": `${liveHeightPx}px` } as React.CSSProperties}
      >
        <span
          className="sheet-handle mx-auto touch-none md:hidden"
          aria-hidden
          onPointerDown={handleHandlePointerDown}
          onPointerMove={handleHandlePointerMove}
          onPointerUp={handleHandlePointerUp}
          onPointerCancel={handleHandlePointerUp}
        />

        <div className="flex items-center justify-between gap-2">
          {!showMinimized && (
            <div>
              <h1 className="text-xl font-semibold leading-tight tracking-tight text-ink">
                Plan your journey
              </h1>
              <p className="mt-1 text-sm text-ink-secondary">
                Kathmandu Valley public transit — direct or single-transfer routes.
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
              viaStops={viaStops}
              onViaStopsChange={setViaStops}
              pickTarget={pickTarget}
              onPickTargetChange={setPickTarget}
              locating={locating}
              locateError={locateError}
              onUseMyLocation={useMyLocation}
            />

            <div className="flex items-center justify-between rounded-xl border border-route-line bg-surface-raised p-4 shadow-card">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/5 text-ink-secondary">
                  <LayersIcon size={14} />
                </span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">
                    Map layers
                  </p>
                  <p className="text-sm text-ink">All stops</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllStops((prev) => !prev)}
                aria-pressed={showAllStops}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  showAllStops
                    ? "bg-ink text-white"
                    : "border border-route-line text-ink-secondary hover:border-ink hover:text-ink"
                }`}
              >
                {showAllStops ? "On" : "Off"}
              </button>
            </div>

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

      <div className="h-full w-full flex-1 md:min-h-0">
        <BusMap
          key="bus-map"
          result={mapResult}
          allStops={stops}
          showAllStops={showAllStops}
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
