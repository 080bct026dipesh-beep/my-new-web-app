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
        <div className="h-6 w-1/2 animate-pulse rounded bg-surface" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-surface" />
        <div className="mt-2 h-24 animate-pulse rounded-lg border border-route-line bg-surface" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto flex h-full max-w-xl flex-col items-start gap-2 p-4">
        <p className="text-sm text-ink">
          Stop <span className="font-mono">{stopId}</span> doesn&apos;t exist.
        </p>
        <Link href="/stops" className="text-sm text-accent-blue hover:underline">
          ← Back to all stops
        </Link>
      </div>
    );
  }

  if (error || !stop) {
    return (
      <div className="mx-auto flex h-full max-w-xl flex-col items-start gap-2 p-4">
        <p role="alert" className="text-sm text-red-700">
          {error ?? "Something went wrong."}
        </p>
        <Link href="/stops" className="text-sm text-accent-blue hover:underline">
          ← Back to all stops
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col gap-4 overflow-y-auto p-4">
      <Link href="/stops" className="text-sm text-ink-secondary hover:text-accent-blue">
        ← All stops
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-ink">{stop.stop_name}</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          {stop.district ?? "District unknown"}
          {stop.zone && <> · {stop.zone}</>}
        </p>
        <div className="mt-2 flex gap-1">
          {stop.is_major_stop && (
            <span className="rounded-full bg-accent-blue/10 px-2 py-0.5 text-xs text-accent-blue">
              Major stop
            </span>
          )}
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
      </div>

      <p className="font-mono text-xs text-ink-secondary">
        {stop.lat.toFixed(5)}, {stop.lng.toFixed(5)}
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/?origin=${encodeURIComponent(stop.stop_id)}`}
          className="rounded-md bg-accent-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Set as origin
        </Link>
        <Link
          href={`/?destination=${encodeURIComponent(stop.stop_id)}`}
          className="rounded-md border border-route-line px-4 py-2 text-sm text-ink hover:border-accent-green hover:text-accent-green"
        >
          Set as destination
        </Link>
      </div>

      <p className="text-xs text-ink-secondary">
        Routes serving this stop aren&apos;t listed here yet -- search a specific origin and
        destination on the{" "}
        <Link href="/" className="text-accent-blue hover:underline">
          search page
        </Link>{" "}
        to find a route through it, or browse the{" "}
        <Link href="/routes" className="text-accent-green hover:underline">
          full route list
        </Link>
        .
      </p>
    </div>
  );
}
