"use client";

import { FareOut, RouteAlternative, RouteLeg, RouteSearchResult } from "@/types/route";
import RouteTimeline from "./RouteTimeline";
import { BusIcon, ClockIcon, TransferIcon, WalkIcon } from "@/components/icons/TransitIcons";

interface RouteResultPanelProps {
  result: RouteSearchResult | null;
  loading: boolean;
  error: string | null;
  /** -1 = the primary/recommended result; otherwise an index into
   * result.alternatives. Controlled by the parent so the same selection
   * also drives what the map draws (see app/page.tsx). */
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
}

const ALTERNATIVE_LABELS: Record<RouteAlternative["label"], string> = {
  alternate_direct_route: "Direct alternative",
  shortest_distance: "Least distance",
  fastest_estimated: "Fastest (est.)",
};

function formatDuration(totalSeconds: number): { value: string; unit: string } {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return { value: String(minutes), unit: "min" };
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0
    ? { value: String(hours), unit: "hr" }
    : { value: `${hours}h ${remaining}`, unit: "min" };
}

function formatFare(fare: FareOut): string {
  const range =
    fare.fare_npr_min === fare.fare_npr_max
      ? `Rs. ${fare.fare_npr_min}`
      : `Rs. ${fare.fare_npr_min}–${fare.fare_npr_max}`;
  return fare.student_discount_pct ? `${range} (${fare.student_discount_pct}% off, students)` : range;
}

export default function RouteResultPanel({
  result,
  loading,
  error,
  selectedIndex,
  onSelectedIndexChange,
}: RouteResultPanelProps) {
  if (loading) {
    return (
      <div
        aria-live="polite"
        className="flex flex-col gap-2 rounded-xl border border-route-line bg-surface-raised p-4 shadow-card"
      >
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface-sunken" />
        <div className="h-16 animate-pulse rounded bg-surface-sunken" />
        <div className="h-16 animate-pulse rounded bg-surface-sunken" />
        <p className="text-xs text-ink-secondary">Finding the best routes…</p>
      </div>
    );
  }

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error}
      </p>
    );
  }

  if (result && !result.found) {
    return (
      <div className="rounded-xl border border-route-line bg-surface-raised p-4 text-sm text-ink shadow-card">
        <p className="font-medium">No bus route found between these stops.</p>
        <p className="mt-1 text-ink-secondary">Try nearby stops, or a different origin or destination.</p>
      </div>
    );
  }

  if (!result) {
    return (
      <p className="text-sm text-ink-secondary">
        Pick a starting stop and a destination, then hit Find route to see it on the map.
      </p>
    );
  }

  // result.found === true from here on.
  const isPrimary = selectedIndex === -1;
  const active: { legs: RouteLeg[]; total_cost: number; transfer_count: number } = isPrimary
    ? result
    : result.alternatives[selectedIndex];

  const legs = active.legs;
  const rideLegs = legs.filter((leg) => leg.route_id !== "TRANSFER");
  const walkLegs = legs.filter((leg) => leg.route_id === "TRANSFER");

  // Alternatives never carry road_geometry (OSRM is only called for the
  // primary result, to avoid tripling external calls per search), so
  // duration/walking-time stats only apply when viewing the primary.
  const allLegsHaveGeometry = isPrimary && legs.every((leg) => leg.road_geometry);
  const totalDurationS = allLegsHaveGeometry
    ? legs.reduce((sum, leg) => sum + (leg.road_geometry?.duration_s ?? 0), 0)
    : null;
  const walkDurationS = walkLegs.reduce((sum, leg) => sum + (leg.road_geometry?.duration_s ?? 0), 0);
  const hasWalkDuration = isPrimary && walkLegs.length > 0 && walkLegs.every((leg) => leg.road_geometry);

  const activeAlt = isPrimary ? null : result.alternatives[selectedIndex];
  const duration = totalDurationS !== null ? formatDuration(totalDurationS) : null;
  const cardLabel = isPrimary
    ? active.transfer_count === 0
      ? "Direct"
      : "Recommended"
    : ALTERNATIVE_LABELS[activeAlt!.label];

  return (
    <div
      aria-live="polite"
      className="flex flex-col gap-3 rounded-xl border border-route-line bg-surface-raised p-4 shadow-card"
    >
      {result.alternatives.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <button
            type="button"
            onClick={() => onSelectedIndexChange(-1)}
            aria-pressed={isPrimary}
            className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${
              isPrimary
                ? "border-accent-purple bg-accent-purple/10 font-medium text-accent-purple"
                : "border-route-line bg-white text-ink-secondary hover:border-accent-purple hover:text-accent-purple"
            }`}
          >
            {result.transfer_count === 0 ? "Direct" : "Recommended"}
          </button>
          {result.alternatives.map((alt, i) => (
            <button
              key={`${alt.label}-${i}`}
              type="button"
              onClick={() => onSelectedIndexChange(i)}
              aria-pressed={selectedIndex === i}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${
                selectedIndex === i
                  ? "border-accent-purple bg-accent-purple/10 font-medium text-accent-purple"
                  : "border-route-line bg-white text-ink-secondary hover:border-accent-purple hover:text-accent-purple"
              }`}
            >
              {ALTERNATIVE_LABELS[alt.label]}
            </button>
          ))}
        </div>
      )}

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-purple">{cardLabel}</p>

        <div className="mt-1.5 flex items-baseline gap-2">
          {duration ? (
            <>
              <span className="text-3xl font-bold leading-none tracking-tight text-ink">{duration.value}</span>
              <span className="text-sm font-medium text-ink-secondary">{duration.unit}</span>
            </>
          ) : (
            <span className="text-sm text-ink-secondary">Duration unavailable for this option</span>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-secondary">
          <span className="inline-flex items-center gap-1">
            <TransferIcon size={13} />
            {active.transfer_count === 0
              ? "Direct"
              : `${active.transfer_count} transfer${active.transfer_count > 1 ? "s" : ""}`}
          </span>
          <span className="inline-flex items-center gap-1">
            <BusIcon size={13} />
            {rideLegs.length} bus{rideLegs.length === 1 ? "" : "es"}
          </span>
          {hasWalkDuration && walkDurationS > 0 && (
            <span className="inline-flex items-center gap-1">
              <WalkIcon size={13} />
              {Math.max(1, Math.round(walkDurationS / 60))} min walking
            </span>
          )}
          <span className="inline-flex items-center gap-1 font-semibold text-ink">
            {result.fare ? formatFare(result.fare) : "Fare unavailable"}
          </span>
        </div>

        {activeAlt?.label === "fastest_estimated" && (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-ink-tertiary">
            <ClockIcon size={12} />
            Estimated from assumed travel speeds, not a live ETA.
          </p>
        )}
      </div>

      <div className="border-t border-route-line pt-3">
        <RouteTimeline legs={legs} />
      </div>
    </div>
  );
}
