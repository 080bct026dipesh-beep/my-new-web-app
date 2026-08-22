import { RouteSearchResult } from "@/types/route";
import RouteTimeline from "./RouteTimeline";

interface RouteResultPanelProps {
  result: RouteSearchResult | null;
  loading: boolean;
  error: string | null;
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours} hr` : `${hours} hr ${remaining} min`;
}

export default function RouteResultPanel({ result, loading, error }: RouteResultPanelProps) {
  if (loading) {
    return (
      <div aria-live="polite" className="flex flex-col gap-2 rounded-lg border border-route-line bg-white p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-surface" />
        <div className="h-16 animate-pulse rounded bg-surface" />
        <div className="h-16 animate-pulse rounded bg-surface" />
        <p className="text-xs text-ink-secondary">Finding the best route…</p>
      </div>
    );
  }

  if (error) {
    return (
      <p
        role="alert"
        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
      >
        {error}
      </p>
    );
  }

  if (result && !result.found) {
    return (
      <div className="rounded-lg border border-route-line bg-white p-4 text-sm text-ink">
        <p className="font-medium">Could not find a route between these stops.</p>
        <p className="mt-1 text-ink-secondary">Try another origin or destination.</p>
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
  const legs = result.legs;
  const rideLegs = legs.filter((leg) => leg.route_id !== "TRANSFER");
  const walkLegs = legs.filter((leg) => leg.route_id === "TRANSFER");

  const allLegsHaveGeometry = legs.every((leg) => leg.road_geometry);
  const totalDurationS = allLegsHaveGeometry
    ? legs.reduce((sum, leg) => sum + (leg.road_geometry?.duration_s ?? 0), 0)
    : null;
  const walkDurationS = walkLegs.reduce((sum, leg) => sum + (leg.road_geometry?.duration_s ?? 0), 0);
  const hasWalkDuration = walkLegs.length > 0 && walkLegs.every((leg) => leg.road_geometry);

  return (
    <div aria-live="polite" className="flex flex-col gap-3 rounded-lg border border-route-line bg-white p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-purple">
          Route result
        </p>
        <p className="mt-1 text-sm font-medium text-ink">
          {result.transfer_count === 0
            ? "Direct route"
            : `${result.transfer_count} transfer${result.transfer_count > 1 ? "s" : ""}`}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-ink-secondary">
          {totalDurationS !== null && <span>{formatDuration(totalDurationS)}</span>}
          <span>{(result.total_cost / 1000).toFixed(1)} km</span>
          <span>
            {rideLegs.length} bus{rideLegs.length === 1 ? "" : "es"}
          </span>
          {hasWalkDuration && walkDurationS > 0 && (
            <span>{Math.max(1, Math.round(walkDurationS / 60))} min walking</span>
          )}
          <span>fare unavailable</span>
        </div>
      </div>

      <div className="border-t border-route-line pt-3">
        <RouteTimeline legs={legs} />
      </div>
    </div>
  );
}
