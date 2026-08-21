import { useEffect, useState } from "react";
import { CongestionSegment } from "@/types/route";
import { getCongestion } from "@/lib/api";

interface UseCongestionResult {
  enabled: boolean;
  toggle: () => void;
  dayOfWeek: number | null;
  hourBucket: number | null;
  setDayOfWeek: (v: number | null) => void;
  setHourBucket: (v: number | null) => void;
  segments: CongestionSegment[];
  loading: boolean;
  hasSeededOnly: boolean;
}

const POLL_INTERVAL_MS = 3 * 60 * 1000;

/**
 * Congestion overlay: off by default (extra map clutter + a fetch most
 * visits don't need), with a day/hour picker that defers to the server's
 * "now" bucket when both are null. Auto-refreshes only while following
 * "now" -- a fixed historical time the user picked deliberately shouldn't
 * refetch on a timer.
 */
export function useCongestion(): UseCongestionResult {
  const [enabled, setEnabled] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null);
  const [hourBucket, setHourBucket] = useState<number | null>(null);
  const [segments, setSegments] = useState<CongestionSegment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getCongestion({
          day_of_week: dayOfWeek ?? undefined,
          hour: hourBucket ?? undefined,
        });
        if (!cancelled) setSegments(data.segments);
      } catch {
        // Congestion is a nice-to-have overlay -- fail silently and just
        // leave whatever was last successfully loaded (or empty) rather
        // than surfacing an error banner for a non-critical layer.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (dayOfWeek === null && hourBucket === null) {
      interval = setInterval(load, POLL_INTERVAL_MS);
    }

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [enabled, dayOfWeek, hourBucket]);

  const hasSeededOnly = segments.length > 0 && segments.every((s) => s.is_seeded);

  return {
    enabled,
    toggle: () => setEnabled((v) => !v),
    dayOfWeek,
    hourBucket,
    setDayOfWeek,
    setHourBucket,
    segments,
    loading,
    hasSeededOnly,
  };
}
