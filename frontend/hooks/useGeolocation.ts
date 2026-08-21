import { useCallback, useEffect, useState } from "react";
import { LatLng, Stop, WalkingRoute } from "@/types/route";
import { buildStopLabel } from "@/lib/stopLabel";
import { getNearbyStops, getWalkingRoute } from "@/lib/api";

interface UseGeolocationOptions {
  stops: Stop[];
  onStopFound?: (label: string) => void;
}

interface UseGeolocationResult {
  userLocation: LatLng | null;
  nearestStop: Stop | null;
  walkingRoute: WalkingRoute | null;
  locating: boolean;
  locateError: string | null;
  useMyLocation: () => void;
}

/**
 * Detects the browser's geolocation, finds the nearest stop via
 * /stops/nearby, and fetches a walking path to it via /walking-route.
 * Auto-runs once on mount (silently -- a denial there is a no-op, not an
 * error, since the user hasn't interacted with the page yet) and again
 * any time `useMyLocation()` is called explicitly (which does surface
 * errors).
 */
export function useGeolocation({ stops, onStopFound }: UseGeolocationOptions): UseGeolocationResult {
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [nearestStop, setNearestStop] = useState<Stop | null>(null);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  const locateNearestStop = useCallback(
    async (lat: number, lng: number) => {
      setUserLocation({ lat, lng });
      try {
        const nearby = await getNearbyStops({ lat, lng, limit: 1 });
        if (nearby.length === 0) {
          setLocateError("No stops found near your location.");
          return;
        }
        const stop = nearby[0];
        setNearestStop(stop);
        onStopFound?.(buildStopLabel(stop, stops));

        try {
          const walk = await getWalkingRoute({
            from_lat: lat,
            from_lng: lng,
            to_lat: stop.lat,
            to_lng: stop.lng,
          });
          setWalkingRoute(walk);
        } catch {
          // Walking directions are a nice-to-have (needs a foot-profile
          // OSRM instance running); the map falls back to a straight line
          // if this fails, so just leave walkingRoute null.
          setWalkingRoute(null);
        }
      } catch {
        setLocateError("Couldn't find a nearby stop. Try again.");
      }
    },
    [stops, onStopFound]
  );

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocateError("Geolocation isn't available in this browser.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await locateNearestStop(position.coords.latitude, position.coords.longitude);
        setLocating(false);
      },
      (err) => {
        setLocateError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : err.code === err.TIMEOUT
            ? "Location request timed out. Try again."
            : "Location unavailable."
        );
        setLocating(false);
      },
      { timeout: 8000 }
    );
  }

  // Silent auto-detect once on load -- never overwrites text the user
  // already typed (onStopFound only fills a blank field), and a denial
  // here doesn't surface an error message on a page they haven't
  // interacted with yet.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        locateNearestStop(position.coords.latitude, position.coords.longitude);
      },
      () => {
        /* permission denied or unavailable -- fine, "Use my location" is still there */
      },
      { timeout: 8000 }
    );
  }, [locateNearestStop]);

  return { userLocation, nearestStop, walkingRoute, locating, locateError, useMyLocation };
}
