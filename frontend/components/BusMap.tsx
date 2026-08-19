"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { CongestionSegment, LatLng, RouteSearchResult, RouteStopEntry, Stop, StopPickTarget, WalkingRoute } from "@/types/route";

const VALLEY_CENTER: [number, number] = [27.7041, 85.32];

// Kept in sync with the legend rendered in app/page.tsx.
const LEG_COLORS = ["#3DDC97", "#F2A93B", "#5DA9E9", "#E06C75"];

// Walking-to-nearest-stop path gets its own color, distinct from both the
// route-leg palette above and the grey used for in-route transfer walks.
const USER_WALK_COLOR = "#5DD8E0";

// Standard traffic-light palette for the congestion overlay -- kept
// separate from LEG_COLORS/USER_WALK_COLOR so it reads unambiguously as
// "speed", not "which route/leg".
const CONGESTION_COLORS: Record<string, string> = {
  free_flow: "#22C55E",
  moderate: "#F59E0B",
  heavy: "#EF4444",
  unknown: "#6B7280",
};

// Route-browser overlay (numbered stops + connecting line for whichever
// route is toggled visible in RoutesPanel) gets its own color too, distinct
// from every other layer this map draws.
const BROWSE_ROUTE_COLOR = "#A78BFA";

function dotIcon(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #0F1418;box-shadow:0 0 0 1px rgba(255,255,255,0.4);"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Origin/destination get bigger, high-contrast markers so the start and end
// of a route are unambiguous at a glance; transfer points sit in between.
const originIcon = dotIcon("#3DDC97", 18);
const destinationIcon = dotIcon("#E06C75", 18);
const transferIcon = dotIcon("#e8ecef", 14);

// Pulsing blue dot for "you are here", the same visual language every map
// app uses so it doesn't need a legend entry of its own.
const userLocationIcon = L.divIcon({
  className: "",
  html: `<span style="position:relative;display:block;width:16px;height:16px;">
      <span style="position:absolute;inset:-8px;border-radius:9999px;background:rgba(93,169,233,0.35);"></span>
      <span style="position:absolute;inset:0;border-radius:9999px;background:#5DA9E9;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.3);"></span>
    </span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface BusMapProps {
  result?: RouteSearchResult | null;
  /** All stops, drawn as small clickable dots so the user can pick a stop
   * directly on the map instead of typing its name. */
  allStops?: Stop[];
  /** Which field (origin/destination) a stop click should fill; null disables
   * map-click selection (dots still render, just aren't wired to onStopPick). */
  pickTarget?: StopPickTarget;
  onStopPick?: (stop: Stop) => void;
  userLocation?: LatLng | null;
  /** Walking directions from userLocation to the nearest stop. */
  walkingRoute?: WalkingRoute | null;
  nearestStop?: Stop | null;
  /** Historical congestion overlay -- straight lines between board/alight
   * stops (no road geometry available at this granularity), colored by
   * congestion_level. Independent of `result`; shows regardless of
   * whether a route is currently searched. */
  congestionSegments?: CongestionSegment[];
  /** Route browser overlay: whichever route is toggled visible via the eye
   * button in RoutesPanel, drawn as numbered stops in ride order + a
   * connecting line. Independent of `result` and congestion. */
  browseRouteStops?: RouteStopEntry[];
}

export default function BusMap({
  result,
  allStops = [],
  pickTarget = null,
  onStopPick,
  userLocation,
  walkingRoute,
  nearestStop,
  congestionSegments = [],
  browseRouteStops = [],
}: BusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Mutable refs so the stops-layer effect (below) always calls the latest
  // pickTarget/onStopPick without needing to rebuild ~1000s of markers on
  // every render just because the callback identity changed. Synced via
  // their own effects (not written during render) per react-hooks/refs.
  const pickTargetRef = useRef(pickTarget);
  const onStopPickRef = useRef(onStopPick);
  useEffect(() => {
    pickTargetRef.current = pickTarget;
  }, [pickTarget]);
  useEffect(() => {
    onStopPickRef.current = onStopPick;
  }, [onStopPick]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current).setView(VALLEY_CENTER, 12);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // All-stops layer: small dots, always present, clickable whenever a
  // pickTarget is active. Kept in its own effect/layer so it doesn't get
  // wiped every time the route result changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const stopsLayer = L.layerGroup().addTo(map);

    allStops.forEach((stop) => {
      const dot = L.circleMarker([stop.lat, stop.lng], {
        radius: 4,
        weight: 1,
        color: "#4b5563",
        fillColor: "#9CA3AF",
        fillOpacity: 0.85,
      });
      dot.bindTooltip(stop.stop_name, { direction: "top", offset: [0, -4] });
      dot.on("click", () => {
        const target = pickTargetRef.current;
        if (target) onStopPickRef.current?.(stop);
      });
      dot.on("mouseover", () => {
        if (pickTargetRef.current) dot.setStyle({ radius: 6, fillColor: "#5DA9E9" });
      });
      dot.on("mouseout", () => {
        dot.setStyle({ radius: 4, fillColor: "#9CA3AF" });
      });
      stopsLayer.addLayer(dot);
    });

    return () => {
      stopsLayer.remove();
    };
  }, [allStops]);

  // Congestion overlay: one straight line per segment (from_stop_id ->
  // to_stop_id), colored by congestion_level. Straight lines rather than
  // road geometry -- the backend only stores per-segment averages, not
  // full OSRM polylines, so this is the same tradeoff BusMap already
  // makes as its road_geometry fallback elsewhere in this file. A
  // separate layer/effect from allStops and result so toggling it on/off
  // doesn't touch either of those.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || congestionSegments.length === 0) return;

    const stopById = new Map(allStops.map((s) => [s.stop_id, s]));
    const layer = L.layerGroup().addTo(map);

    congestionSegments.forEach((seg) => {
      const from = stopById.get(seg.from_stop_id);
      const to = stopById.get(seg.to_stop_id);
      if (!from || !to) return; // stop list hasn't loaded yet, or stopped existing

      const color = CONGESTION_COLORS[seg.congestion_level] ?? CONGESTION_COLORS.unknown;
      const line = L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng],
        ],
        {
          color,
          weight: 5,
          opacity: seg.is_seeded ? 0.5 : 0.85,
          dashArray: seg.is_seeded ? "3 5" : undefined,
        }
      );

      const minutes = Math.round(seg.avg_duration_s / 60);
      const freeFlowMinutes = Math.round(seg.free_flow_duration_s / 60);
      const label =
        seg.congestion_level === "free_flow"
          ? "Free-flow"
          : seg.congestion_level === "moderate"
          ? "Moderate congestion"
          : "Heavy congestion";
      line.bindPopup(
        `<strong>${from.stop_name} → ${to.stop_name}</strong>${
          seg.route_id ? `<br/>${seg.route_id}` : ""
        }<br/>${label} (${seg.congestion_ratio.toFixed(1)}x free-flow)` +
          `<br/>~${minutes} min typical, ${freeFlowMinutes} min free-flow` +
          (seg.is_seeded
            ? "<br/><em>Estimated baseline -- no confirmed traffic data yet</em>"
            : `<br/>Based on ${seg.sample_count} sample${seg.sample_count === 1 ? "" : "s"}`)
      );
      layer.addLayer(line);
    });

    return () => {
      layer.remove();
    };
  }, [congestionSegments, allStops]);

  // Route-browser overlay: numbered markers in ride order + a connecting
  // line for whichever route is toggled visible via RoutesPanel's eye
  // button. Straight lines between consecutive stops, same tradeoff as the
  // congestion overlay -- no per-hop road geometry is fetched just to
  // preview a route's stop order. Auto-fits the map to the route so the
  // user doesn't have to hunt for it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || browseRouteStops.length === 0) return;

    console.log("[BusMap] browseRouteStops received:", browseRouteStops);

    // Coerce + validate -- some API responses send lat/lng as strings, and
    // a single bad/missing coordinate would otherwise throw inside this
    // effect and silently kill the marker + polyline + fitBounds below it,
    // with nothing but a swallowed error to show for it.
    const validEntries = browseRouteStops
      .map((entry) => ({
        entry,
        lat: Number(entry.stop?.lat),
        lng: Number(entry.stop?.lng),
      }))
      .filter(({ lat, lng }) => Number.isFinite(lat) && Number.isFinite(lng));

    if (validEntries.length < browseRouteStops.length) {
      console.warn(
        `[BusMap] Dropped ${browseRouteStops.length - validEntries.length} route stop(s) with invalid lat/lng -- check the /routes/{route_id}/stops response shape.`,
        browseRouteStops.filter((entry) => {
          const lat = Number(entry.stop?.lat);
          const lng = Number(entry.stop?.lng);
          return !(Number.isFinite(lat) && Number.isFinite(lng));
        })
      );
    }

    if (validEntries.length === 0) {
      console.error("[BusMap] No valid coordinates in browseRouteStops -- nothing to draw. Check field names (lat/lng vs latitude/longitude?).");
      return;
    }

    const layer = L.layerGroup().addTo(map);
    const latLngs: [number, number][] = validEntries.map(({ lat, lng }) => [lat, lng]);

    L.polyline(latLngs, { color: BROWSE_ROUTE_COLOR, weight: 4, opacity: 0.85 }).addTo(layer);

    validEntries.forEach(({ entry, lat, lng }) => {
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          html: `<span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:${BROWSE_ROUTE_COLOR};color:#0F1418;font-size:11px;font-weight:600;border:2px solid #0F1418;">${entry.sequence_no}</span>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      });
      marker.bindTooltip(`${entry.sequence_no}. ${entry.stop.stop_name}`, {
        direction: "top",
        offset: [0, -8],
      });
      layer.addLayer(marker);
    });

    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [40, 40] });

    return () => {
      layer.remove();
    };
  }, [browseRouteStops]);

  // Cursor feedback so it's obvious the map is in "pick a stop" mode.
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.style.cursor = pickTarget ? "crosshair" : "";
  }, [pickTarget]);

  // User location marker + walking path to the nearest stop.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    const layer = L.layerGroup().addTo(map);

    const marker = L.marker([userLocation.lat, userLocation.lng], {
      icon: userLocationIcon,
      zIndexOffset: 1000,
    });
    marker.bindPopup("Your location");
    layer.addLayer(marker);

    if (walkingRoute) {
      const points = walkingRoute.geometry.coordinates.map(
        ([lng, lat]) => [lat, lng] as [number, number]
      );
      const line = L.polyline(points, {
        color: USER_WALK_COLOR,
        weight: 4,
        dashArray: "4 8",
      });
      const distanceKm = (walkingRoute.distance_m / 1000).toFixed(1);
      const minutes = Math.round(walkingRoute.duration_s / 60);
      line.bindPopup(
        `<strong>Walk to ${nearestStop?.stop_name ?? "nearest stop"}</strong><br/>${distanceKm} km · ~${minutes} min`
      );
      layer.addLayer(line);
    } else if (nearestStop) {
      // OSRM foot-routing unavailable/unset up -- fall back to a straight
      // line so the user still sees roughly where the nearest stop is.
      const line = L.polyline(
        [
          [userLocation.lat, userLocation.lng],
          [nearestStop.lat, nearestStop.lng],
        ],
        { color: USER_WALK_COLOR, weight: 3, dashArray: "2 6", opacity: 0.7 }
      );
      line.bindPopup(`Approx. path to ${nearestStop.stop_name} (straight line)`);
      layer.addLayer(line);
    }

    return () => {
      layer.remove();
    };
  }, [userLocation, walkingRoute, nearestStop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const routeLayer = L.layerGroup().addTo(map);
    let legend: L.Control | null = null;

    if (result?.found && result.legs.length > 0) {
      const bounds: L.LatLngExpression[] = [];
      const legendRows: { label: string; color: string; dashed: boolean }[] = [];

      result.legs.forEach((leg, i) => {
        const isWalk = leg.route_id === "TRANSFER";
        const color = isWalk ? "#9CA3AF" : LEG_COLORS[i % LEG_COLORS.length];
        const isFirstLeg = i === 0;
        const isLastLeg = i === result.legs.length - 1;

        legendRows.push({
          label: isWalk ? "Walk transfer" : leg.route_name,
          color,
          dashed: isWalk,
        });

        // Only the very start and end of the whole trip get the big
        // origin/destination markers; everything in between (including
        // both ends of a walking transfer) is a smaller transfer dot.
        const fromIcon = isFirstLeg ? originIcon : transferIcon;
        const toIcon = isLastLeg ? destinationIcon : transferIcon;

        const fromMarker = L.marker([leg.board_stop.lat, leg.board_stop.lng], {
          icon: fromIcon,
        });
        fromMarker.bindPopup(
          `<strong>${leg.board_stop.stop_name}</strong><br/>${
            isFirstLeg ? "Origin" : "Transfer point"
          }`
        );
        routeLayer.addLayer(fromMarker);

        const toMarker = L.marker([leg.alight_stop.lat, leg.alight_stop.lng], {
          icon: toIcon,
        });
        toMarker.bindPopup(
          `<strong>${leg.alight_stop.stop_name}</strong><br/>${
            isLastLeg ? "Destination" : "Transfer point"
          }`
        );
        routeLayer.addLayer(toMarker);

        // Small dot for every intermediate stop (skip first/last — those
        // already have a marker above).
        leg.stops.slice(1, -1).forEach((stop) => {
          const dot = L.circleMarker([stop.lat, stop.lng], {
            radius: 5,
            color,
            fillColor: "#ffffff",
            fillOpacity: 1,
            weight: 2,
          });
          dot.bindPopup(stop.stop_name);
          routeLayer.addLayer(dot);
        });

        // GeoJSON coordinates are [lng, lat]; Leaflet wants [lat, lng].
        const roadPoints = leg.road_geometry?.geometry.coordinates.map(
          ([lng, lat]) => [lat, lng] as [number, number]
        );

        // Falls back to a straight line only if OSRM failed for this leg
        // (see backend _attach_road_geometry's `except OSRMError: pass`).
        const points: [number, number][] =
          roadPoints ?? [
            [leg.board_stop.lat, leg.board_stop.lng],
            [leg.alight_stop.lat, leg.alight_stop.lng],
          ];

        const polyline = L.polyline(points, {
          color,
          weight: isWalk ? 4 : 5,
          dashArray: isWalk ? "6 8" : undefined,
        });

        const kmLabel = leg.road_geometry
          ? `${(leg.road_geometry.distance_m / 1000).toFixed(1)} km`
          : null;
        polyline.bindPopup(
          `<strong>${isWalk ? "Walk" : leg.route_name}</strong>${
            kmLabel ? `<br/>${kmLabel}` : ""
          }`
        );
        routeLayer.addLayer(polyline);

        bounds.push(...points);
      });

      if (bounds.length > 0) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
      }

      const LegendControl = L.Control.extend({
        onAdd: () => {
          const div = L.DomUtil.create("div");
          div.style.background = "#161D23";
          div.style.border = "1px solid #2A343B";
          div.style.borderRadius = "8px";
          div.style.padding = "8px 10px";
          div.style.fontSize = "12px";
          div.style.color = "#e8ecef";
          div.style.lineHeight = "1.6";
          div.innerHTML = legendRows
            .map(
              (row) =>
                `<div style="display:flex;align-items:center;gap:6px;">
                  <span style="display:inline-block;width:14px;height:0;border-top:3px ${
                    row.dashed ? "dashed" : "solid"
                  } ${row.color};"></span>
                  <span>${row.label}</span>
                </div>`
            )
            .join("");
          return div;
        },
      });
      legend = new LegendControl({ position: "bottomleft" });
      legend.addTo(map);
    }

    return () => {
      routeLayer.remove();
      legend?.remove();
    };
  }, [result]);

  return (
    <div
      ref={mapContainerRef}
      role="region"
      aria-label="Route map"
      style={{ height: "100%", width: "100%", minHeight: "400px" }}
    />
  );
}
