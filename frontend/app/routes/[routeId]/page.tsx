"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, getRoute, getRouteStops } from "@/lib/api";
import { formatRouteDistance } from "@/lib/routeDistance";
import { RouteOut, RouteStopEntry } from "@/types/route";

export default function RouteDetailPage() {
  const params = useParams<{ routeId: string }>();
  const routeId = decodeURIComponent(params.routeId);

  const [route, setRoute] = useState<RouteOut | null>(null);
  const [stops, setStops] = useState<RouteStopEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setNotFound(false);
      setError(null);
      try {
        const [routeData, stopsData] = await Promise.all([
          getRoute(routeId),
          getRouteStops(routeId),
        ]);
        if (!cancelled) {
          setRoute(routeData);
          setStops(stopsData);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError("Couldn't load this route. Try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  if (loading) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col gap-3 overflow-y-auto p-4">
        <div className="h-6 w-1/2 animate-pulse rounded bg-surface" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
        <div className="mt-4 flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col items-start gap-2 p-4">
        <p className="text-sm text-ink">
          Route <span className="font-mono">{routeId}</span> doesn&apos;t exist.
        </p>
        <Link href="/routes" className="text-sm text-accent-green hover:underline">
          ← Back to all routes
        </Link>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="mx-auto flex h-full max-w-2xl flex-col items-start gap-2 p-4">
        <p role="alert" className="text-sm text-red-700">
          {error ?? "Something went wrong."}
        </p>
        <Link href="/routes" className="text-sm text-accent-green hover:underline">
          ← Back to all routes
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col gap-4 overflow-y-auto p-4">
      <Link href="/routes" className="text-sm text-ink-secondary hover:text-accent-green">
        ← All routes
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-ink">
          {route.short_name ? `${route.short_name} — ` : ""}
          {route.route_name}
        </h1>
        <p className="mt-1 font-mono text-sm text-ink-secondary">
          {route.vehicle_type} · {route.total_stops} stops
          {formatRouteDistance(route) && <> · {formatRouteDistance(route)}</>}
        </p>
        {route.operator && (
          <p className="text-sm text-ink-secondary">Operated by {route.operator.name}</p>
        )}
        {route.status !== "active" && (
          <span className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
            {route.status}
          </span>
        )}
      </div>

      <Link
        href={`/?route=${encodeURIComponent(route.route_id)}`}
        className="self-start rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        View on map
      </Link>

      <div>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-accent-purple">
          Stops in order
        </h2>
        <ol className="flex flex-col">
          {stops.map((entry, i) => (
            <li key={`${entry.stop.stop_id}-${entry.sequence_no}`} className="relative flex gap-3 pb-3 last:pb-0">
              {i < stops.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[9px] top-5 h-[calc(100%-1rem)] w-px bg-route-line"
                />
              )}
              <span
                aria-hidden
                className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-route-line bg-white text-[10px] text-ink-secondary"
              >
                {entry.sequence_no}
              </span>
              <Link
                href={`/stops/${encodeURIComponent(entry.stop.stop_id)}`}
                className="text-sm text-ink hover:text-accent-blue"
              >
                {entry.stop.stop_name}
                {entry.stop.district && (
                  <span className="text-ink-secondary"> — {entry.stop.district}</span>
                )}
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
