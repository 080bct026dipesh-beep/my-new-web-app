"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { CongestionSegment, LatLng, RouteGeometry, RouteSearchResult, RouteStopEntry, Stop, StopPickTarget, WalkingRoute } from "@/types/route";
import { LEG_COLORS } from "@/lib/constants";
import { clusterStops } from "@/lib/stopClustering";

const VALLEY_CENTER: [number, number] = [27.7041, 85.32];

// Kept in sync with the legend rendered in app/page.tsx.

// Walking-to-nearest-stop path gets its own color, distinct from both the
// route-leg palette above and the grey used for in-route transfer walks.
const USER_WALK_COLOR = "#0D9488";

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
// route is toggled visible on /routes, or embedded on a route/stop detail
// page) gets its own color too, distinct
// from every other layer this map draws.
const BROWSE_ROUTE_COLOR = "#7C3AED";

// Stop/route names come from admin data entry (or ultimately OSM/CSV
// imports) and get interpolated into raw HTML strings below for Leaflet
// popups/tooltips/divIcons. Leaflet treats string content as HTML, not
// text, so anything containing `<`/`>`/`&` etc. would otherwise render
// (and execute, for something like an <img onerror>) as markup. Escape
// every such value at the point of interpolation.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function dotIcon(color: string, size: number): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.25);"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Origin/destination get bigger, high-contrast markers so the start and end
// of a route are unambiguous at a glance; transfer points sit in between.
// Colors follow the app-wide semantic mapping: origin = blue, destination =
// red, transfer = purple.
const originIcon = dotIcon("#2563EB", 18);
const destinationIcon = dotIcon("#DC2626", 18);
const transferIcon = dotIcon("#7C3AED", 14);

// Pulsing blue dot for "you are here", the same visual language every map
// app uses so it doesn't need a legend entry of its own.
const userLocationIcon = L.divIcon({
  className: "",
  html: `<span style="position:relative;display:block;width:16px;height:16px;">
      <span style="position:absolute;inset:-8px;border-radius:9999px;background:rgba(37,99,235,0.25);"></span>
      <span style="position:absolute;inset:0;border-radius:9999px;background:#2563EB;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.25);"></span>
    </span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Cluster bubble for the all-stops layer (lib/stopClustering.ts) -- a
// plain numbered circle, distinct from every route-specific icon above so
// it reads as "N stops here, zoom in" rather than being mistaken for a
// route marker.
function clusterIcon(count: number): L.DivIcon {
  const size = count >= 100 ? 34 : count >= 10 ? 30 : 26;
  return L.divIcon({
    className: "",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:#4B5563;color:#ffffff;font-size:11px;font-weight:600;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.25);">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

interface BusMapProps {
  result?: RouteSearchResult | null;
  /** All stops, drawn as small clickable dots so the user can pick a stop
   * directly on the map instead of typing its name. */
  allStops?: Stop[];
  /** Master on/off for the all-stops layer -- separate from the automatic
   * dimming that happens once a route is found (see `dimmed` below).
   * Defaults on so map-click stop-picking keeps working out of the box. */
  showAllStops?: boolean;
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
   * toggle on /routes (or a route/stop detail page embed), drawn as
   * numbered stops in ride order + a
   * connecting line. Independent of `result` and congestion. */
  browseRouteStops?: RouteStopEntry[];
  /** Road-following OSRM geometry for browseRouteStops, when available --
   * draws the connecting line along actual roads instead of straight
   * segments between consecutive stops. Null/undefined falls back to the
   * straight-line connector (OSRM unavailable, or still loading). */
  browseRouteGeometry?: RouteGeometry | null;
}

export default function BusMap({
  result,
  allStops = [],
  showAllStops = true,
  pickTarget = null,
  onStopPick,
  userLocation,
  walkingRoute,
  nearestStop,
  congestionSegments = [],
  browseRouteStops = [],
  browseRouteGeometry = null,
}: BusMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Current zoom, mirrored into React state so the all-stops effect
  // re-clusters when it changes. Only zoom triggers a recompute (not
  // pan) -- see lib/stopClustering.ts for why that's a deliberate
  // simplification, not an oversight.
  const [zoom, setZoom] = useState(12);

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

  // Latest user location + the current route's bounds, both read (not
  // reacted to) by the recenter control's click handler below -- same
  // ref-mirroring pattern as pickTargetRef, so the control doesn't need
  // to be torn down and recreated every time either of these changes.
  const userLocationRef = useRef(userLocation);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);
  const routeBoundsRef = useRef<L.LatLngBounds | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) {
      return;
    }

    const map = L.map(mapContainerRef.current).setView(VALLEY_CENTER, 12);
    mapRef.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Distance reference -- standard on every consumer map product, and
    // this app had no way to gauge scale at all before this.
    L.control.scale({ position: "bottomright", imperial: false }).addTo(map);

    // Re-cluster the all-stops layer on zoom change (see zoom state above
    // and lib/stopClustering.ts).
    map.on("zoomend", () => setZoom(map.getZoom()));

    // Recenter control: one button, three behaviors depending on what's
    // currently shown, checked in priority order at click time via refs
    // (not props) so this control -- created once, here -- doesn't need
    // to be torn down and rebuilt every time a route or location changes.
    const RecenterControl = L.Control.extend({
      onAdd: () => {
        const button = L.DomUtil.create("button") as HTMLButtonElement;
        button.type = "button";
        button.setAttribute("aria-label", "Recenter map");
        button.title = "Recenter map";
        button.style.width = "34px";
        button.style.height = "34px";
        button.style.background = "#ffffff";
        button.style.border = "1px solid #E4E4DF";
        button.style.borderRadius = "8px";
        button.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
        button.style.display = "flex";
        button.style.alignItems = "center";
        button.style.justifyContent = "center";
        button.style.cursor = "pointer";
        button.innerHTML =
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14171C" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>';
        button.addEventListener("click", () => {
          if (routeBoundsRef.current) {
            map.fitBounds(routeBoundsRef.current, { padding: [40, 40] });
          } else if (userLocationRef.current) {
            map.setView([userLocationRef.current.lat, userLocationRef.current.lng], 15);
          } else {
            map.setView(VALLEY_CENTER, 12);
          }
        });
        L.DomEvent.disableClickPropagation(button);
        return button;
      },
    });
    new RecenterControl({ position: "bottomright" }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // All-stops layer: small dots (or numbered cluster bubbles when zoomed
  // out -- see lib/stopClustering.ts), clickable whenever a pickTarget is
  // active. Kept in its own effect/layer so it doesn't get wiped every
  // time the route result changes.
  //
  // Dims (not hides) once a route is found, so the highlighted route
  // stands out without losing the surrounding stops for context; the
  // showAllStops prop is the separate, explicit on/off a person can
  // choose themselves (see the toggle in app/page.tsx).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !showAllStops) return;

    const stopsLayer = L.layerGroup().addTo(map);
    const dimmed = Boolean(result?.found);
    const dotFillOpacity = dimmed ? 0.35 : 0.85;
    const dotColor = dimmed ? "#D1D5DB" : "#4b5563";
    const dotFill = dimmed ? "#E5E7EB" : "#9CA3AF";

    const clusters = clusterStops(allStops, zoom);

    clusters.forEach((cluster) => {
      if (cluster.stops.length === 1) {
        const stop = cluster.stops[0];
        const dot = L.circleMarker([stop.lat, stop.lng], {
          radius: 4,
          weight: 1,
          color: dotColor,
          fillColor: dotFill,
          fillOpacity: dotFillOpacity,
        });
        dot.bindTooltip(escapeHtml(stop.stop_name), {
          direction: "top",
          offset: [0, -4],
          className: "ktm-tooltip",
        });
        dot.on("click", () => {
          const target = pickTargetRef.current;
          if (target) onStopPickRef.current?.(stop);
        });
        dot.on("mouseover", () => {
          if (pickTargetRef.current) dot.setStyle({ radius: 6, fillColor: "#2563EB" });
        });
        dot.on("mouseout", () => {
          dot.setStyle({ radius: 4, fillColor: dotFill });
        });
        stopsLayer.addLayer(dot);
        return;
      }

      // A cluster bubble isn't a stand-in for any one of its stops, so it
      // isn't wired to onStopPick even when a pickTarget is active --
      // clicking it zooms in instead, splitting it back into individually
      // pickable dots.
      const marker = L.marker([cluster.lat, cluster.lng], {
        icon: clusterIcon(cluster.stops.length),
      });
      marker.bindTooltip(`${cluster.stops.length} stops -- click to zoom in`, {
        direction: "top",
        offset: [0, -12],
        className: "ktm-tooltip",
      });
      marker.on("click", () => {
        map.setView([cluster.lat, cluster.lng], Math.min(zoom + 3, 18));
      });
      stopsLayer.addLayer(marker);
    });

    return () => {
      stopsLayer.remove();
    };
  }, [allStops, showAllStops, zoom, result?.found]);

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
        `<strong>${escapeHtml(from.stop_name)} → ${escapeHtml(to.stop_name)}</strong>${
          seg.route_id ? `<br/>${escapeHtml(seg.route_id)}` : ""
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
  // line for whichever route is toggled visible via /routes' eye
  // button. Straight lines between consecutive stops, same tradeoff as the
  // congestion overlay -- no per-hop road geometry is fetched just to
  // preview a route's stop order. Auto-fits the map to the route so the
  // user doesn't have to hunt for it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || browseRouteStops.length === 0) return;

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

    // Prefer the OSRM road-following polyline when available; fall back to
    // straight segments between consecutive stops otherwise (OSRM down, or
    // still loading). Bounds are still fit to the stop markers either way,
    // so this doesn't affect zoom/pan behavior.
    const roadPoints = browseRouteGeometry?.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng] as [number, number]
    );
    const linePoints = roadPoints ?? latLngs;
    L.polyline(linePoints, { color: BROWSE_ROUTE_COLOR, weight: 4, opacity: 0.85 }).addTo(layer);

    validEntries.forEach(({ entry, lat, lng }) => {
      const marker = L.marker([lat, lng], {
        icon: L.divIcon({
          className: "",
          html: `<span style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:9999px;background:${BROWSE_ROUTE_COLOR};color:#ffffff;font-size:11px;font-weight:600;border:2px solid #ffffff;box-shadow:0 0 0 1px rgba(0,0,0,0.25);">${entry.sequence_no}</span>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        }),
      });
      marker.bindTooltip(`${entry.sequence_no}. ${escapeHtml(entry.stop.stop_name)}`, {
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
  }, [browseRouteStops, browseRouteGeometry]);

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
        `<strong>Walk to ${escapeHtml(nearestStop?.stop_name ?? "nearest stop")}</strong><br/>${distanceKm} km · ~${minutes} min`
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
      line.bindPopup(`Approx. path to ${escapeHtml(nearestStop.stop_name)} (straight line)`);
      layer.addLayer(line);
    }

    return () => {
      layer.remove();
    };
  }, [userLocation, walkingRoute, nearestStop]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // One layer group per leg (rather than one shared group for the whole
    // route) so the legend below can toggle a single leg's visibility
    // in/out of the map independently of the others.
    const legLayers: L.LayerGroup[] = [];
    let legend: L.Control | null = null;
    routeBoundsRef.current = null;

    if (result?.found && result.legs.length > 0) {
      const bounds: L.LatLngExpression[] = [];
      const legendRows: { label: string; color: string; dashed: boolean }[] = [];

      result.legs.forEach((leg, i) => {
        const legLayer = L.layerGroup().addTo(map);
        legLayers.push(legLayer);

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
          `<strong>${escapeHtml(leg.board_stop.stop_name)}</strong><br/>${
            isFirstLeg ? "Origin" : "Transfer point"
          }`
        );
        legLayer.addLayer(fromMarker);

        const toMarker = L.marker([leg.alight_stop.lat, leg.alight_stop.lng], {
          icon: toIcon,
        });
        toMarker.bindPopup(
          `<strong>${escapeHtml(leg.alight_stop.stop_name)}</strong><br/>${
            isLastLeg ? "Destination" : "Transfer point"
          }`
        );
        legLayer.addLayer(toMarker);

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
          dot.bindPopup(escapeHtml(stop.stop_name));
          legLayer.addLayer(dot);
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
          `<strong>${isWalk ? "Walk" : escapeHtml(leg.route_name)}</strong>${
            kmLabel ? `<br/>${kmLabel}` : ""
          }`
        );
        legLayer.addLayer(polyline);

        bounds.push(...points);
      });

      if (bounds.length > 0) {
        const latLngBounds = L.latLngBounds(bounds);
        routeBoundsRef.current = latLngBounds;
        map.fitBounds(latLngBounds, { padding: [40, 40] });
      }

      const LegendControl = L.Control.extend({
        onAdd: () => {
          const div = L.DomUtil.create("div");
          div.style.background = "#ffffff";
          div.style.border = "1px solid #E4E4DF";
          div.style.borderRadius = "8px";
          div.style.padding = "8px 10px";
          div.style.fontSize = "12px";
          div.style.color = "#171717";
          div.style.lineHeight = "1.6";
          div.style.boxShadow = "0 1px 3px rgba(0,0,0,0.08)";
          // Unconstrained, this box sizes to its longest route_name and can
          // run wider than a phone viewport (Leaflet clips overflowing
          // controls rather than reflowing the page, so it just becomes
          // unreadable rather than breaking layout). Cap the width relative
          // to the viewport and let long names wrap instead of overflowing.
          div.style.maxWidth = "min(220px, 60vw)";

          // Built as real DOM nodes with real click listeners (rather than
          // one innerHTML string) so each row can toggle its own leg's
          // layer on/off. A row is a button, not just styled text, so it's
          // keyboard-reachable and has a real click target -- clicking
          // hides that leg from the map and gives the row itself a muted,
          // struck-through look as feedback.
          legendRows.forEach((row, i) => {
            const rowButton = document.createElement("button");
            rowButton.type = "button";
            rowButton.style.display = "flex";
            rowButton.style.alignItems = "flex-start";
            rowButton.style.gap = "6px";
            rowButton.style.width = "100%";
            rowButton.style.background = "none";
            rowButton.style.border = "none";
            rowButton.style.padding = "2px 0";
            rowButton.style.cursor = "pointer";
            rowButton.style.textAlign = "left";
            rowButton.style.font = "inherit";
            rowButton.style.color = "inherit";
            rowButton.setAttribute(
              "aria-label",
              `Toggle ${row.label} on the map`
            );
            rowButton.setAttribute("aria-pressed", "true");

            const swatch = document.createElement("span");
            swatch.style.display = "inline-block";
            swatch.style.width = "14px";
            swatch.style.height = "0px";
            swatch.style.marginTop = "7px";
            swatch.style.flexShrink = "0";
            swatch.style.borderTop = `3px ${row.dashed ? "dashed" : "solid"} ${row.color}`;

            const labelSpan = document.createElement("span");
            labelSpan.style.wordBreak = "break-word";
            labelSpan.textContent = row.label;

            rowButton.appendChild(swatch);
            rowButton.appendChild(labelSpan);

            let visible = true;
            rowButton.addEventListener("click", () => {
              visible = !visible;
              rowButton.setAttribute("aria-pressed", String(visible));
              if (visible) {
                legLayers[i].addTo(map);
                rowButton.style.opacity = "1";
                labelSpan.style.textDecoration = "none";
              } else {
                legLayers[i].remove();
                rowButton.style.opacity = "0.45";
                labelSpan.style.textDecoration = "line-through";
              }
            });

            div.appendChild(rowButton);
          });

          // Without this, a click on the legend (which sits on top of the
          // map) falls through to the map underneath and pans/zooms it --
          // a well-known Leaflet control gotcha, not just a hypothetical.
          L.DomEvent.disableClickPropagation(div);
          return div;
        },
      });
      legend = new LegendControl({ position: "bottomleft" });
      legend.addTo(map);
    }

    return () => {
      legLayers.forEach((layer) => layer.remove());
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
