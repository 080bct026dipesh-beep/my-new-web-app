import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRouteSearch } from "@/hooks/useRouteSearch";
import * as api from "@/lib/api";
import { RouteFinderResult } from "@/types/route";

function makeResult(overrides: Partial<RouteFinderResult> = {}): RouteFinderResult {
  return {
    origin_stop_id: "S0001",
    destination_stop_id: "S0002",
    total_cost: 10,
    transfer_count: 0,
    legs: [],
    fare: null,
    alternatives: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useRouteSearch", () => {
  it("sets loading during the request and populates result on success", async () => {
    const result = makeResult();
    vi.spyOn(api, "findRoute").mockResolvedValue({ found: true, result });

    const { result: hook } = renderHook(() => useRouteSearch());
    let searchPromise!: Promise<void>;
    act(() => {
      searchPromise = hook.current.search("S0001", "S0002");
    });
    expect(hook.current.loading).toBe(true);

    await act(async () => {
      await searchPromise;
    });

    expect(hook.current.loading).toBe(false);
    expect(hook.current.result).toEqual({ found: true, ...result });
    expect(hook.current.error).toBeNull();
  });

  it("sets result to { found: false } (not an error) when the backend reports no route", async () => {
    vi.spyOn(api, "findRoute").mockResolvedValue({ found: false });

    const { result: hook } = renderHook(() => useRouteSearch());
    await act(async () => {
      await hook.current.search("S0001", "S0002");
    });

    expect(hook.current.result).toEqual({ found: false });
    expect(hook.current.error).toBeNull();
  });

  it("sets a generic error message on a network failure", async () => {
    vi.spyOn(api, "findRoute").mockRejectedValue(new api.ApiError("boom", "network"));

    const { result: hook } = renderHook(() => useRouteSearch());
    await act(async () => {
      await hook.current.search("S0001", "S0002");
    });

    expect(hook.current.error).toMatch(/couldn't reach the server/i);
    expect(hook.current.loading).toBe(false);
  });

  it("ignores a slower, superseded search's result once a newer search has started", async () => {
    // Regression guard for the requestIdRef race guard: fire search #1
    // (slow), then immediately fire search #2 (fast) before #1 resolves.
    // Only #2's result should ever be reflected in state.
    let resolveFirst!: (v: { found: true; result: RouteFinderResult }) => void;
    const firstPromise = new Promise<{ found: true; result: RouteFinderResult }>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResult = makeResult({ origin_stop_id: "S0003", destination_stop_id: "S0004" });

    const findRouteSpy = vi
      .spyOn(api, "findRoute")
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(async () => ({ found: true, result: secondResult }));

    const { result: hook } = renderHook(() => useRouteSearch());

    let firstSearch!: Promise<void>;
    act(() => {
      firstSearch = hook.current.search("S0001", "S0002");
    });

    let secondSearch!: Promise<void>;
    await act(async () => {
      secondSearch = hook.current.search("S0003", "S0004");
      await secondSearch;
    });

    expect(hook.current.result).toEqual({ found: true, ...secondResult });

    // Now let the slow first request resolve -- it must NOT clobber the
    // second search's already-displayed result.
    await act(async () => {
      resolveFirst({
        found: true,
        result: makeResult({ origin_stop_id: "S0001", destination_stop_id: "S0002" }),
      });
      await firstSearch;
    });

    expect(hook.current.result).toEqual({ found: true, ...secondResult });
    expect(findRouteSpy).toHaveBeenCalledTimes(2);
  });

  it("reset() clears result, error, and loading, and prevents an in-flight search from landing", async () => {
    let resolveSearch!: (v: { found: true; result: RouteFinderResult }) => void;
    const pending = new Promise<{ found: true; result: RouteFinderResult }>((resolve) => {
      resolveSearch = resolve;
    });
    vi.spyOn(api, "findRoute").mockReturnValue(pending);

    const { result: hook } = renderHook(() => useRouteSearch());
    let searchPromise!: Promise<void>;
    act(() => {
      searchPromise = hook.current.search("S0001", "S0002");
    });

    act(() => {
      hook.current.reset();
    });
    expect(hook.current.loading).toBe(false);
    expect(hook.current.result).toBeNull();
    expect(hook.current.error).toBeNull();

    await act(async () => {
      resolveSearch({ found: true, result: makeResult() });
      await searchPromise;
    });

    // The superseded search's result must not reappear after reset().
    expect(hook.current.result).toBeNull();
    expect(hook.current.loading).toBe(false);
  });
});
