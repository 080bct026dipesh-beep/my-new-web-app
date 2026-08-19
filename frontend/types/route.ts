// Mirrors backend/app/schemas.py exactly. Keep in sync if the backend changes.

export interface Stop {
  stop_id: string;
  stop_name: string;
  lat: number;
  lng: number;
  zone?: string | null;
  district?: string | null;
  is_major_stop: boolean;
  is_interchange: boolean;
  status: string;
}

export interface RoadGeometry {
  // GeoJSON LineString: coordinates are [lng, lat] pairs, per GeoJSON spec.
  // Convert to [lat, lng] before handing to Leaflet.
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  distance_m: number;
  duration_s: number;
}

export interface RouteLeg {
  route_id: string;
  route_name: string;
  board_stop: Stop;
  alight_stop: Stop;
  num_ride_segments: number; // count of merged ride segments (hops), not physical stops
  stops: Stop[]; // every physical stop on this leg, in order, board→alight inclusive
  road_geometry?: RoadGeometry | null;
}

export interface RouteFinderResult {
  origin_stop_id: string;
  destination_stop_id: string;
  total_cost: number;
  transfer_count: number;
  legs: RouteLeg[];
}

// Frontend-only wrapper: the backend signals "not found" via HTTP 404,
// not a `found` field, so we add it client-side after the fetch.
export type RouteSearchResult =
  | ({ found: true } & RouteFinderResult)
  | { found: false };

// Which field a map click should fill in. Null means clicking a stop on
// the map does nothing (the default, idle state).
export type StopPickTarget = "origin" | "destination" | null;

export interface LatLng {
  lat: number;
  lng: number;
}

// GET /walking-route response -- same shape as RoadGeometry, kept separate
// so call sites don't imply it came from a bus leg.
export type WalkingRoute = RoadGeometry;

// Mirrors CongestionLevel / CongestionSegmentOut / CongestionResponse in
// backend/app/schemas.py.
export type CongestionLevel = "free_flow" | "moderate" | "heavy" | "unknown";

export interface CongestionSegment {
  route_id: string | null;
  from_stop_id: string;
  to_stop_id: string;
  avg_duration_s: number;
  avg_distance_m: number;
  free_flow_duration_s: number;
  congestion_ratio: number;
  congestion_level: CongestionLevel;
  sample_count: number;
  is_seeded: boolean;
}

export interface CongestionResponse {
  day_of_week: number;
  hour_bucket: number;
  segments: CongestionSegment[];
}

// Mirrors RouteOut / RouteStopOut / RouteListOut in backend/app/schemas.py.
export interface RouteOperator {
  operator_id: string;
  name: string;
  service_type: string | null;
}

export interface RouteSummary {
  route_id: string;
  route_name: string;
  short_name: string | null;
  vehicle_type: string;
  start_stop_id: string;
  end_stop_id: string;
  total_stops: number;
  approx_distance_km: number | null;
  status: string;
  operator: RouteOperator | null;
}

export interface RouteListResponse {
  total: number;
  limit: number;
  offset: number;
  items: RouteSummary[];
}

// GET /routes/{route_id}/stops -- a route's stops, in ride order.
export interface RouteStopEntry {
  sequence_no: number;
  stop: Stop;
}