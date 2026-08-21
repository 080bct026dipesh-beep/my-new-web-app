import { RouteLeg } from "@/types/route";
import { LEG_COLORS } from "@/lib/constants";

interface RouteTimelineProps {
  legs: RouteLeg[];
}

function legDistanceKm(leg: RouteLeg): string | null {
  const meters = leg.road_geometry?.distance_m;
  if (meters === undefined || meters === null) return null;
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

function legDurationMin(leg: RouteLeg): string | null {
  const seconds = leg.road_geometry?.duration_s;
  if (seconds === undefined || seconds === null) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

/**
 * Renders a route-finder result as a walk/ride step list. Only uses data
 * the backend actually returns (route_name, board/alight stops, physical
 * stop count, and road_geometry distance/duration when OSRM succeeded for
 * that leg) -- never invents fare, timing, or operator info.
 */
export default function RouteTimeline({ legs }: RouteTimelineProps) {
  return (
    <ol className="flex flex-col">
      {legs.map((leg, i) => {
        const isWalk = leg.route_id === "TRANSFER";
        const isLast = i === legs.length - 1;
        const distance = legDistanceKm(leg);
        const duration = legDurationMin(leg);
        const physicalStops = leg.stops.length;

        return (
          <li key={`${leg.route_id}-${i}`} className="relative flex gap-3 pb-4 last:pb-0">
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-route-line"
              />
            )}
            <span
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs"
              style={{
                backgroundColor: isWalk ? "#374151" : LEG_COLORS[i % LEG_COLORS.length],
                color: isWalk ? "#D1D5DB" : "#0F1418",
              }}
              aria-hidden
            >
              {isWalk ? "🚶" : "🚌"}
            </span>
            <div className="flex-1 pt-0.5">
              {isWalk ? (
                <>
                  <p className="text-sm font-medium">Walk</p>
                  <p className="text-xs text-neutral-400">
                    {[distance, duration].filter(Boolean).join(" · ") || "Transfer on foot"}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">{leg.route_name}</p>
                  <p className="text-xs text-neutral-400">
                    {leg.board_stop.stop_name} → {leg.alight_stop.stop_name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {physicalStops} stop{physicalStops === 1 ? "" : "s"}
                    {duration && <> · ~{duration}</>}
                  </p>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
