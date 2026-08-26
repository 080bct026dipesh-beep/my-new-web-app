import { useCallback, useState } from "react";
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
 * Only runs when `useMyLocation()` is called explicitly by the user (a
 * button press) -- browsers increasingly refuse or auto-dismiss a
 * permission prompt that wasn't triggered by a user gesture, so firing
 * this automatically on mount could silently fail (or just look broken)
 * depending on the browser, with no user action to retry from.
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

  return { userLocation, nearestStop, walkingRoute, locating, locateError, useMyLocation };
}
