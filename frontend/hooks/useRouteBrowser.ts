import { useEffect, useState } from "react";
import { RouteStopEntry, RouteSummary } from "@/types/route";
import { getRouteStops, getRoutes } from "@/lib/api";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

interface UseRouteBrowserResult {
  routes: RouteSummary[];
  total: number;
  loading: boolean;
  loadingMore: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  visibleRouteId: string | null;
  visibleRouteStops: RouteStopEntry[];
  visibleRouteStopsLoading: boolean;
  toggleVisible: (route: RouteSummary) => void;
  /** Show a specific route's stops by ID without requiring it to be in
   * the currently loaded/paged list -- used for deep links like
   * /routes/[routeId]'s "View on map" action. */
  showRouteById: (routeId: string) => Promise<void>;
  loadMore: () => void;
  hasMore: boolean;
}

/**
 * Paged/searchable list of routes, with one route at a time toggle-able
 * "visible" (its ordered stops shown both inline in the panel and drawn
 * on the map). Only one visible at a time keeps the map readable --
 * matches the congestion/walking overlays' single-layer approach.
 */
export function useRouteBrowser(): UseRouteBrowserResult {
  const [routes, setRoutes] = useState<RouteSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [visibleRouteId, setVisibleRouteId] = useState<string | null>(null);
  const [visibleRouteStops, setVisibleRouteStops] = useState<RouteStopEntry[]>([]);
  const [visibleRouteStopsLoading, setVisibleRouteStopsLoading] = useState(false);
  const [routeStopsCache, setRouteStopsCache] = useState<Record<string, RouteStopEntry[]>>({});

  // Debounced search -- re-fetch page 1 whenever the query settles,
  // rather than on every keystroke.
  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await getRoutes({
          limit: PAGE_SIZE,
          offset: 0,
          q: searchQuery.trim() || undefined,
        });
        if (!cancelled) {
          setRoutes(data.items);
          setTotal(data.total);
        }
      } catch {
        // Route browser is supplementary -- fail silently, panel just
        // shows "no routes" rather than an error banner.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const data = await getRoutes({
        limit: PAGE_SIZE,
        offset: routes.length,
        q: searchQuery.trim() || undefined,
      });
      setRoutes((prev) => [...prev, ...data.items]);
      setTotal(data.total);
    } catch {
      // supplementary feature -- ignore
    } finally {
      setLoadingMore(false);
    }
  }

  async function toggleVisible(route: RouteSummary) {
    if (visibleRouteId === route.route_id) {
      setVisibleRouteId(null);
      setVisibleRouteStops([]);
      return;
    }

    setVisibleRouteId(route.route_id);

    const cached = routeStopsCache[route.route_id];
    if (cached) {
      setVisibleRouteStops(cached);
      return;
    }

    setVisibleRouteStopsLoading(true);
    setVisibleRouteStops([]);
    try {
      const data = await getRouteStops(route.route_id);
      setVisibleRouteStops(data);
      setRouteStopsCache((prev) => ({ ...prev, [route.route_id]: data }));
    } catch {
      // supplementary feature -- leave the list empty rather than erroring
    } finally {
      setVisibleRouteStopsLoading(false);
    }
  }

  async function showRouteById(routeId: string) {
    if (visibleRouteId === routeId) return;

    setVisibleRouteId(routeId);

    const cached = routeStopsCache[routeId];
    if (cached) {
      setVisibleRouteStops(cached);
      return;
    }

    setVisibleRouteStopsLoading(true);
    setVisibleRouteStops([]);
    try {
      const data = await getRouteStops(routeId);
      setVisibleRouteStops(data);
      setRouteStopsCache((prev) => ({ ...prev, [routeId]: data }));
    } catch {
      setVisibleRouteId(null);
    } finally {
      setVisibleRouteStopsLoading(false);
    }
  }

  return {
    routes,
    total,
    loading,
    loadingMore,
    searchQuery,
    setSearchQuery,
    visibleRouteId,
    visibleRouteStops,
    visibleRouteStopsLoading,
    toggleVisible,
    showRouteById,
    loadMore,
    hasMore: routes.length < total,
  };
}
