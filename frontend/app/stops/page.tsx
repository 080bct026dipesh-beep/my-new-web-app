"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStops } from "@/hooks/useStops";
import { buildStopLabel } from "@/lib/stopLabel";

export default function StopsPage() {
  const { stops, loading, error } = useStops();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stops;
    return stops.filter(
      (stop) =>
        stop.stop_name.toLowerCase().includes(q) ||
        (stop.district?.toLowerCase().includes(q) ?? false)
    );
  }, [stops, query]);

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-4">
      <div>
        <h1 className="text-lg font-semibold">Stops</h1>
        <p className="text-sm text-neutral-400">
          {stops.length > 0 ? `${stops.length} stops across the Valley` : "Browse every stop"}
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by stop name or district…"
        className="w-full rounded-md border border-route-line bg-route-panel px-3 py-2 text-sm outline-none focus:border-route-accent"
      />

      {error && (
        <p className="rounded-md border border-amber-900 bg-amber-950/40 px-3 py-2 text-sm text-amber-300">
          Couldn&apos;t load the stop list from the server.
        </p>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-route-panel" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && stops.length > 0 && (
        <p className="text-sm text-neutral-500">No stops match &quot;{query.trim()}&quot;.</p>
      )}

      <ul className="flex flex-col gap-2">
        {filtered.map((stop) => (
          <li key={stop.stop_id}>
            <Link
              href={`/stops/${encodeURIComponent(stop.stop_id)}`}
              className="flex items-center justify-between gap-3 rounded-lg bg-route-panel px-4 py-3 hover:bg-route-panel/70"
            >
              <div>
                <p className="text-sm font-medium">{buildStopLabel(stop, stops)}</p>
                {stop.district && <p className="text-xs text-neutral-400">{stop.district}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                {stop.is_interchange && (
                  <span className="rounded-full bg-route-accent/15 px-2 py-0.5 text-xs text-route-accent">
                    Interchange
                  </span>
                )}
                {stop.status !== "active" && (
                  <span className="rounded-full bg-amber-950/50 px-2 py-0.5 text-xs text-amber-300">
                    {stop.status}
                  </span>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
