import { describe, expect, it } from "vitest";
import { buildStopLabel, buildStopLabelIndex } from "@/lib/stopLabel";
import { Stop } from "@/types/route";

function makeStop(overrides: Partial<Stop> = {}): Stop {
  return {
    stop_id: "S0001",
    stop_name: "Ratna Park",
    lat: 27.7,
    lng: 85.31,
    zone: null,
    district: null,
    is_major_stop: false,
    is_interchange: false,
    status: "active",
    ...overrides,
  };
}

describe("buildStopLabel", () => {
  it("returns the bare stop_name when it's unique among allStops", () => {
    const stop = makeStop({ stop_name: "Ratna Park" });
    const all = [stop, makeStop({ stop_id: "S0002", stop_name: "Koteshwor" })];
    expect(buildStopLabel(stop, all)).toBe("Ratna Park");
  });

  it("disambiguates with district when stop_name repeats", () => {
    const a = makeStop({ stop_id: "S0001", stop_name: "Chowk", district: "Kathmandu" });
    const b = makeStop({ stop_id: "S0002", stop_name: "Chowk", district: "Lalitpur" });
    const all = [a, b];
    expect(buildStopLabel(a, all)).toBe("Chowk (Kathmandu)");
    expect(buildStopLabel(b, all)).toBe("Chowk (Lalitpur)");
  });

  it("falls back to stop_id for disambiguation when district is missing", () => {
    const a = makeStop({ stop_id: "S0001", stop_name: "Bus Park", district: null });
    const b = makeStop({ stop_id: "S0002", stop_name: "Bus Park", district: null });
    const all = [a, b];
    expect(buildStopLabel(a, all)).toBe("Bus Park (S0001)");
  });

  it("does not disambiguate a stop that merely shares a name with itself once", () => {
    const stop = makeStop({ stop_name: "Solo Stop" });
    expect(buildStopLabel(stop, [stop])).toBe("Solo Stop");
  });
});

describe("buildStopLabelIndex", () => {
  it("maps lowercased trimmed labels back to their Stop", () => {
    const stop = makeStop({ stop_name: "Ratna Park" });
    const { labelToStop } = buildStopLabelIndex([stop]);
    expect(labelToStop.get("ratna park")).toBe(stop);
  });

  it("produces one label entry per stop, matching buildStopLabel's disambiguation", () => {
    const a = makeStop({ stop_id: "S0001", stop_name: "Chowk", district: "Kathmandu" });
    const b = makeStop({ stop_id: "S0002", stop_name: "Chowk", district: "Lalitpur" });
    const { labels, labelToStop } = buildStopLabelIndex([a, b]);

    expect(labels).toEqual([
      { stop_id: "S0001", label: "Chowk (Kathmandu)" },
      { stop_id: "S0002", label: "Chowk (Lalitpur)" },
    ]);
    expect(labelToStop.get("chowk (kathmandu)")).toBe(a);
    expect(labelToStop.get("chowk (lalitpur)")).toBe(b);
  });
});
