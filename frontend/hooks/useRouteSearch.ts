import { useRef, useState } from "react";
import { RouteSearchResult } from "@/types/route";
import { ApiError, findRoute } from "@/lib/api";

interface UseRouteSearchResult {
  result: RouteSearchResult | null;
  loading: boolean;
  error: string | null;
  search: (originId: string, destinationId: string) => Promise<void>;
  reset: () => void;
}

/**
 * Owns GET /route-finder request state. A 404 from the backend means
 * "no route between these stops" -- a normal outcome rendered as
 * `{ found: false }`, distinct from network/server errors which set
 * `error` instead.
 */
export function useRouteSearch(): UseRouteSearchResult {
  const [result, setResult] = useState<RouteSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a slow earlier search overwriting a faster later one
  // if the user fires two searches back-to-back.
  const requestIdRef = useRef(0);

  async function search(originId: string, destinationId: string) {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const outcome = await findRoute({ origin: originId, destination: destinationId });
      if (requestIdRef.current !== requestId) return;

      if (!outcome.found) {
        setResult({ found: false });
      } else {
        setResult({ found: true, ...outcome.result });
      }
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      const message =
        err instanceof ApiError && err.kind !== "network"
          ? "Something went wrong. Try again."
          : "Couldn't reach the server. Check your connection and try again.";
      setError(message);
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }

  function reset() {
    requestIdRef.current++;
    setResult(null);
    setError(null);
    setLoading(false);
  }

  return { result, loading, error, search, reset };
}
