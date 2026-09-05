import { Stop } from "@/types/route";

/**
 * Groups nearby stops into clusters for the all-stops map layer
 * (components/BusMap.tsx), so zooming out doesn't pile hundreds of
 * overlapping dots on top of each other -- the same category of problem
 * the backend's graph_builder.py solved for walking-edge construction
 * (grid-bucket instead of comparing every pair), applied here to marker
 * rendering instead of edge construction.
 *
 * Deliberately zoom-only, not viewport-bounds-aware: grouping is purely a
 * function of (stop coordinates, zoom level), not which part of the map
 * is currently visible. That's a simplification over "real" marker-
 * clustering libraries (which re-cluster on pan too, to keep cluster
 * counts accurate for exactly what's on screen), but it means BusMap only
 * needs to recompute on zoomend, not on every pan -- a good trade for a
 * single-city stop count where panning across the valley never changes
 * the total number of stops being clustered.
 */
export interface StopCluster {
  /** Stable across renders for the same zoom+grouping, suitable as a
   * React/Leaflet layer key. */
  key: string;
  lat: number;
  lng: number;
  stops: Stop[];
}

// Below this zoom level... nothing special -- clustering applies at every
// zoom, it's just that the grid cell shrinks fast enough (see
// cellSizeDegrees below) that at high zoom every stop ends up alone in
// its own cell anyway, which is what makes a single formula work across
// the whole zoom range instead of needing a hardcoded per-zoom threshold.
const CLUSTER_PIXEL_RADIUS = 40;
const TILE_SIZE_PX = 256;

/** Roughly how many degrees of longitude correspond to CLUSTER_PIXEL_RADIUS
 * screen pixels at the given zoom, using the standard Web Mercator tile
 * math (each zoom level doubles the number of 256px tiles spanning 360
 * degrees). Approximate -- ignores latitude-dependent Mercator distortion,
 * which is fine here since Kathmandu Valley spans well under a degree of
 * latitude, so the distortion is negligible across the whole dataset. */
function cellSizeDegrees(zoom: number): number {
  return (CLUSTER_PIXEL_RADIUS * 360) / (TILE_SIZE_PX * Math.pow(2, zoom));
}

export function clusterStops(stops: Stop[], zoom: number): StopCluster[] {
  if (stops.length === 0) return [];

  const cellSize = cellSizeDegrees(zoom);
  const buckets = new Map<string, Stop[]>();

  for (const stop of stops) {
    const gx = Math.floor(stop.lat / cellSize);
    const gy = Math.floor(stop.lng / cellSize);
    const key = `${gx}:${gy}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(stop);
    } else {
      buckets.set(key, [stop]);
    }
  }

  const clusters: StopCluster[] = [];
  for (const [key, bucketStops] of buckets) {
    const lat = bucketStops.reduce((sum, s) => sum + s.lat, 0) / bucketStops.length;
    const lng = bucketStops.reduce((sum, s) => sum + s.lng, 0) / bucketStops.length;
    clusters.push({ key, lat, lng, stops: bucketStops });
  }
  return clusters;
}
