"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ApiError, getStop } from "@/lib/api";
import { Stop } from "@/types/route";

export default function StopDetailPage() {
  const params = useParams<{ stopId: string }>();
  const stopId = decodeURIComponent(params.stopId);

  const [stop, setStop] = useState<Stop | null>(null);
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
        const data = await getStop(stopId);
        if (!cancelled) setStop(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else {
          setError("Couldn't load this stop. Try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [stopId]);

  if (loading) {
    return (
      <div className="mx-auto flex h-full max-w-xl flex-col gap-3 p-4">
        <div className="h-6 w-1/2 animate-pulse rounded bg-route-panel" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-route-panel" />
        <div className="mt-2 h-24 animate-pulse rounded-lg bg-route-panel" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto flex h-full max-w-xl flex-col items-start gap-2 p-4">
        <p className="text-sm text-neutral-300">
          Stop <span className="font-mono">{stopId}</span> doesn&apos;t exist.
        </p>
        <Link href="/stops" className="text-sm text-route-accent hover:underline">
          ← Back to all stops
        </Link>
      </div>
    );
  }

  if (error || !stop) {
    return (
      <div className="mx-auto flex h-full max-w-xl flex-col items-start gap-2 p-4">
        <p role="alert" className="text-sm text-red-400">
          {error ?? "Something went wrong."}
        </p>
        <Link href="/stops" className="text-sm text-route-accent hover:underline">
          ← Back to all stops
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-4 overflow-y-auto p-4">
      <Link href="/stops" className="text-sm text-neutral-400 hover:text-route-accent">
        ← All stops
      </Link>

      <div>
        <h1 className="text-lg font-semibold">{stop.stop_name}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {stop.district ?? "District unknown"}
          {stop.zone && <> · {stop.zone}</>}
        </p>
        <div className="mt-2 flex gap-1">
          {stop.is_major_stop && (
            <span className="rounded-full bg-route-accent/15 px-2 py-0.5 text-xs text-route-accent">
              Major stop
            </span>
          )}
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
      </div>

      <p className="text-xs text-neutral-500">
        {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/?origin=${encodeURIComponent(stop.stop_id)}`}
          className="rounded-md bg-route-accent px-4 py-2 text-sm font-medium text-route-bg"
        >
          Set as origin
        </Link>
        <Link
          href={`/?destination=${encodeURIComponent(stop.stop_id)}`}
          className="rounded-md border border-route-line px-4 py-2 text-sm text-neutral-200 hover:border-route-accent hover:text-route-accent"
        >
          Set as destination
        </Link>
      </div>

      <p className="text-xs text-neutral-500">
        Routes serving this stop aren&apos;t listed here yet -- search a specific origin and
        destination on the{" "}
        <Link href="/" className="text-route-accent hover:underline">
          search page
        </Link>{" "}
        to find a route through it, or browse the{" "}
        <Link href="/routes" className="text-route-accent hover:underline">
          full route list
        </Link>
        .
      </p>
    </div>
  );
}
