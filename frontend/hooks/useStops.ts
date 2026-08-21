import { useEffect, useState } from "react";
import { Stop } from "@/types/route";
import { getAllStops } from "@/lib/api";

interface UseStopsResult {
  stops: Stop[];
  loading: boolean;
  error: boolean;
}

/**
 * Loads every stop once on mount (paged through internally by
 * getAllStops). Search still works if the user knows a stop_id even when
 * this fails -- the autocomplete/"use my location" affordances are what
 * actually need this list, so a failure here is surfaced as a soft
 * `error` flag rather than blocking the page.
 */
export function useStops(): UseStopsResult {
  const [stops, setStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(false);
      try {
        const all = await getAllStops();
        if (!cancelled) setStops(all);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stops, loading, error };
}
