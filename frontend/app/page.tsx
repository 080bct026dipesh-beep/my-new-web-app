"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import SearchForm from "@/components/search/SearchForm";
import CongestionPanel from "@/components/CongestionPanel";
import RoutesPanel from "@/components/RoutesPanel";
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
    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-500">
      Loading map…
    </div>
  ),
});

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

  const congestion = useCongestion();
  const routeBrowser = useRouteBrowser();

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
      <aside className="flex w-full flex-col gap-4 overflow-y-auto border-b border-route-line p-4 md:h-full md:max-w-sm md:border-b-0 md:border-r">
        <div>
          <h1 className="text-lg font-semibold">🚌 KTM Bus</h1>
          <p className="text-sm text-neutral-400">
            Kathmandu Valley public transit navigator — direct or single-transfer routes.
          </p>
        </div>

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

        <RoutesPanel
          routes={routeBrowser.routes}
          routesLoading={routeBrowser.loading}
          total={routeBrowser.total}
          searchQuery={routeBrowser.searchQuery}
          onSearchChange={routeBrowser.setSearchQuery}
          visibleRouteId={routeBrowser.visibleRouteId}
          visibleRouteStops={routeBrowser.visibleRouteStops}
          visibleRouteStopsLoading={routeBrowser.visibleRouteStopsLoading}
          onToggleVisible={routeBrowser.toggleVisible}
          hasMore={routeBrowser.hasMore}
          onLoadMore={routeBrowser.loadMore}
          loadingMore={routeBrowser.loadingMore}
        />

        {stopsError && (
          <p className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
            Couldn&apos;t load the stop list from the server. You can still search if you know
            exact stop names, but suggestions won&apos;t be available.
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="ml-2 font-medium text-amber-200 underline"
            >
              Retry
            </button>
          </p>
        )}

        <RouteResultPanel result={result} loading={loading} error={error} />
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
          congestionSegments={congestion.enabled ? congestion.segments : []}
          browseRouteStops={routeBrowser.visibleRouteStops}
        />
      </div>
    </main>
  );
}
