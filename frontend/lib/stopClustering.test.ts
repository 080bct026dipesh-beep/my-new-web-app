import { describe, expect, it } from "vitest";
import { clusterStops } from "./stopClustering";
import { Stop } from "@/types/route";

function makeStop(overrides: Partial<Stop> = {}): Stop {
  return {
    stop_id: "S0001",
    stop_name: "Test Stop",
    lat: 27.7,
    lng: 85.3,
    is_major_stop: false,
    is_interchange: false,
    status: "active",
    ...overrides,
  };
}

describe("clusterStops", () => {
  it("returns an empty array for no stops", () => {
    expect(clusterStops([], 12)).toEqual([]);
  });

  it("keeps two widely-separated stops in separate clusters at any reasonable zoom", () => {
    const stops = [
      makeStop({ stop_id: "S0001", lat: 27.7, lng: 85.3 }),
      makeStop({ stop_id: "S0002", lat: 27.75, lng: 85.4 }), // ~10km away
    ];
    const clusters = clusterStops(stops, 14);
    expect(clusters).toHaveLength(2);
  });

  it("groups two stops a few meters apart into one cluster when zoomed out", () => {
    const stops = [
      makeStop({ stop_id: "S0001", lat: 27.7, lng: 85.3 }),
      makeStop({ stop_id: "S0002", lat: 27.70005, lng: 85.30005 }), // ~7m away
    ];
    const clusters = clusterStops(stops, 8); // zoomed way out
    expect(clusters).toHaveLength(1);
    expect(clusters[0].stops).toHaveLength(2);
  });

  it("splits the same two nearby stops into separate clusters when zoomed in enough", () => {
    const stops = [
      makeStop({ stop_id: "S0001", lat: 27.7, lng: 85.3 }),
      makeStop({ stop_id: "S0002", lat: 27.71, lng: 85.31 }), // ~1.4km away
    ];
    // At low zoom these fall in the same coarse cell...
    expect(clusterStops(stops, 8)).toHaveLength(1);
    // ...but a cell this small at high zoom can't span 1.4km, so they split.
    expect(clusterStops(stops, 16)).toHaveLength(2);
  });

  it("computes a cluster's center as the average of its member stops", () => {
    const stops = [
      makeStop({ stop_id: "S0001", lat: 27.70, lng: 85.30 }),
      makeStop({ stop_id: "S0002", lat: 27.702, lng: 85.302 }),
    ];
    const clusters = clusterStops(stops, 8);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].lat).toBeCloseTo(27.701, 5);
    expect(clusters[0].lng).toBeCloseTo(85.301, 5);
  });

  it("gives every cluster a stable, unique key", () => {
    const stops = [
      makeStop({ stop_id: "S0001", lat: 27.70, lng: 85.30 }),
      makeStop({ stop_id: "S0002", lat: 27.72, lng: 85.34 }),
      makeStop({ stop_id: "S0003", lat: 27.68, lng: 85.28 }),
    ];
    const clusters = clusterStops(stops, 12);
    const keys = new Set(clusters.map((c) => c.key));
    expect(keys.size).toBe(clusters.length);
  });
});
