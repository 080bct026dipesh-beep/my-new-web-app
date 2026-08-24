import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useStops } from "@/hooks/useStops";
import * as api from "@/lib/api";
import { Stop } from "@/types/route";

function makeStop(id: string): Stop {
  return {
    stop_id: id,
    stop_name: `Stop ${id}`,
    lat: 27.7,
    lng: 85.3,
    zone: null,
    district: null,
    is_major_stop: false,
    is_interchange: false,
    status: "active",
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useStops", () => {
  it("starts in a loading state with no stops or error", () => {
    vi.spyOn(api, "getAllStops").mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useStops());
    expect(result.current.loading).toBe(true);
    expect(result.current.stops).toEqual([]);
    expect(result.current.error).toBe(false);
  });

  it("populates stops and clears loading once getAllStops resolves", async () => {
    const stops = [makeStop("S0001"), makeStop("S0002")];
    vi.spyOn(api, "getAllStops").mockResolvedValue(stops);

    const { result } = renderHook(() => useStops());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stops).toEqual(stops);
    expect(result.current.error).toBe(false);
  });

  it("sets the soft error flag (not a thrown error) when getAllStops rejects", async () => {
    vi.spyOn(api, "getAllStops").mockRejectedValue(new api.ApiError("network down", "network"));

    const { result } = renderHook(() => useStops());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe(true);
    expect(result.current.stops).toEqual([]);
  });
});
