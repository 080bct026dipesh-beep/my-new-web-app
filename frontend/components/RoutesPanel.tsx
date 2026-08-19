"use client";

import { useEffect, useState } from "react";
import { RouteStopEntry, RouteSummary } from "@/types/route";

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 4.22-5.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 7 11 7a20.3 20.3 0 0 1-2.7 3.79M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

interface RoutesPanelProps {
  routes: RouteSummary[];
  routesLoading?: boolean;
  total: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  visibleRouteId: string | null;
  visibleRouteStops: RouteStopEntry[];
  visibleRouteStopsLoading?: boolean;
  onToggleVisible: (route: RouteSummary) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore?: boolean;
}

export default function RoutesPanel({
  routes,
  routesLoading,
  total,
  searchQuery,
  onSearchChange,
  visibleRouteId,
  visibleRouteStops,
  visibleRouteStopsLoading,
  onToggleVisible,
  hasMore,
  onLoadMore,
  loadingMore,
}: RoutesPanelProps) {
  // Local draft so typing doesn't hit the network on every keystroke --
  // the parent's fetch only fires once this is committed via the search
  // button or Enter. Synced from the prop so an external reset (e.g. the
  // parent clearing searchQuery elsewhere) is reflected here too.
  const [draftQuery, setDraftQuery] = useState(searchQuery);

  useEffect(() => {
    setDraftQuery(searchQuery);
  }, [searchQuery]);

  function commitSearch() {
    onSearchChange(draftQuery);
  }

  const isDirty = draftQuery !== searchQuery;

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-route-panel p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Routes</p>
        <p className="text-xs text-neutral-500">{total} total</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          commitSearch();
        }}
        className="flex items-center gap-2"
      >
        <input
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          placeholder="Search routes by name…"
          className="min-w-0 flex-1 rounded-md border border-route-line bg-route-bg px-3 py-2 text-sm outline-none focus:border-route-accent"
        />
        <button
          type="submit"
          aria-label="Search routes"
          title="Search"
          className={`flex-shrink-0 rounded-md border border-route-line p-2 text-neutral-400 hover:border-route-accent hover:text-route-accent ${
            isDirty ? "border-route-accent text-route-accent" : ""
          }`}
        >
          <SearchIcon />
        </button>
      </form>

      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {routesLoading && routes.length === 0 && (
          <p className="py-2 text-xs text-neutral-500">Loading routes…</p>
        )}
        {!routesLoading && routes.length === 0 && (
          <p className="py-2 text-xs text-neutral-500">No routes match &quot;{searchQuery}&quot;.</p>
        )}

        {routes.map((route) => {
          const isVisible = visibleRouteId === route.route_id;
          return (
            <div key={route.route_id} className="rounded-md">
              <div className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-route-bg">
                <button
                  type="button"
                  onClick={() => onToggleVisible(route)}
                  aria-pressed={isVisible}
                  aria-label={isVisible ? `Hide ${route.route_name}` : `Show ${route.route_name} and its stops`}
                  title={isVisible ? "Hide route" : "Show route + stops in order"}
                  className={`flex-shrink-0 rounded-full p-1.5 ${
                    isVisible
                      ? "bg-route-accent text-route-bg"
                      : "text-neutral-400 hover:text-route-accent"
                  }`}
                >
                  <EyeIcon open={isVisible} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{route.route_name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {route.vehicle_type} · {route.total_stops} stops
                    {route.operator ? ` · ${route.operator.name}` : ""}
                  </p>
                </div>
              </div>

              {isVisible && (
                <div className="ml-9 mr-2 mb-2 max-h-56 overflow-y-auto rounded-md border border-route-line bg-route-bg p-2">
                  {visibleRouteStopsLoading ? (
                    <p className="text-xs text-neutral-500">Loading stops…</p>
                  ) : (
                    <ol className="flex flex-col gap-1">
                      {visibleRouteStops.map((entry) => (
                        <li key={entry.sequence_no} className="flex items-center gap-2 text-xs">
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-route-accent/20 text-[10px] font-medium text-route-accent">
                            {entry.sequence_no}
                          </span>
                          <span className="truncate text-neutral-200">{entry.stop.stop_name}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="rounded-md border border-route-line py-1.5 text-xs text-neutral-400 hover:border-route-accent hover:text-route-accent disabled:opacity-50"
        >
          {loadingMore ? "Loading…" : "Load more routes"}
        </button>
      )}
    </div>
  );
}
