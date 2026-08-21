"use client";

import Link from "next/link";
import { useRouteBrowser } from "@/hooks/useRouteBrowser";

export default function RoutesPage() {
  const { routes, total, loading, loadingMore, searchQuery, setSearchQuery, hasMore, loadMore } =
    useRouteBrowser();

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h1 className="text-lg font-semibold">Routes</h1>
        <p className="text-sm text-neutral-400">
          {total > 0 ? `${total} routes across the Valley` : "Browse every route in the network"}
        </p>
      </div>

      <input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search by route name or number…"
        className="w-full rounded-md border border-route-line bg-route-panel px-3 py-2 text-sm outline-none focus:border-route-accent"
      />

      {loading && routes.length === 0 && (
        <div className="flex flex-col gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-route-panel" />
          ))}
        </div>
      )}

      {!loading && routes.length === 0 && (
        <p className="text-sm text-neutral-500">
          {searchQuery.trim()
            ? `No routes match "${searchQuery.trim()}".`
            : "No routes available."}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {routes.map((route) => (
          <li key={route.route_id}>
            <Link
              href={`/routes/${encodeURIComponent(route.route_id)}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-route-panel px-4 py-3 hover:bg-route-panel/70"
            >
              <div>
                <p className="text-sm font-medium">
                  {route.short_name ? `${route.short_name} — ` : ""}
                  {route.route_name}
                </p>
                <p className="text-xs text-neutral-400">
                  {route.vehicle_type} · {route.total_stops} stops
                  {route.approx_distance_km !== null && (
                    <> · {route.approx_distance_km.toFixed(1)} km</>
                  )}
                  {route.operator && <> · {route.operator.name}</>}
                </p>
              </div>
              {route.status !== "active" && (
                <span className="shrink-0 rounded-full bg-amber-950/50 px-2 py-0.5 text-xs text-amber-300">
                  {route.status}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="self-center rounded-md border border-route-line px-4 py-2 text-sm text-neutral-300 hover:border-route-accent hover:text-route-accent disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
