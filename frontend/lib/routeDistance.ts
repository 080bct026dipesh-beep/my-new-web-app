import { RouteSummary } from "@/types/route";

/**
 * osrm_distance_km is the real road distance (computed by
 * backend/scripts/compute_osrm_route_distances.py); approx_distance_km
 * is source-data-supplied and not reliably accurate (see
 * Route.distance_flagged_for_recompute in the backend). Every place
 * that shows a route's distance should go through this so they can't
 * drift -- one showing the OSRM figure, another the raw one.
 *
 * Returns null when neither is available.
 */
export function bestRouteDistanceKm(route: RouteSummary): number | null {
  return route.osrm_distance_km ?? route.approx_distance_km ?? null;
}

/** Formatted "X.X km", or null if no distance is available. */
export function formatRouteDistance(route: RouteSummary): string | null {
  const km = bestRouteDistanceKm(route);
  return km === null ? null : `${km.toFixed(1)} km`;
}
