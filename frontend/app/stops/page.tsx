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
        <h1 className="text-xl font-semibold tracking-tight">
          <span className="text-accent-blue">All</span> <span className="text-ink">stops</span>
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {stops.length > 0 ? `${stops.length} stops across the Valley` : "Browse every stop"}
        </p>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by stop name or district…"
        className="w-full rounded-md border border-route-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-accent-blue"
      />

      {error && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Couldn&apos;t load the stop list from the server.
        </p>
      )}

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg border border-route-line bg-surface" />
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && stops.length > 0 && (
        <p className="text-sm text-ink-secondary">No stops match &quot;{query.trim()}&quot;.</p>
      )}

      <ul className="flex flex-col divide-y divide-route-line rounded-lg border border-route-line">
        {filtered.map((stop) => (
          <li key={stop.stop_id}>
            <Link
              href={`/stops/${encodeURIComponent(stop.stop_id)}`}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface"
            >
              <div>
                <p className="text-sm font-medium text-ink">{buildStopLabel(stop, stops)}</p>
                {stop.district && <p className="font-mono text-xs text-ink-secondary">{stop.district}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                {stop.is_interchange && (
                  <span className="rounded-full bg-accent-purple/10 px-2 py-0.5 text-xs text-accent-purple">
                    Interchange
                  </span>
                )}
                {stop.status !== "active" && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
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
