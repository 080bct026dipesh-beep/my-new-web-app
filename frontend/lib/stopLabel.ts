import { Stop } from "@/types/route";

/**
 * stop_name isn't guaranteed unique across the Kathmandu Valley (generic
 * names like "Chowk" or "Bus Park" repeat at different physical
 * locations). Every place that shows or matches a stop by typed text
 * must use this same disambiguation so the label a user sees/types
 * always maps back to exactly one Stop -- see SearchForm.tsx's datalist
 * and page.tsx's map-click / geolocation / "use my location" handlers.
 */
export function buildStopLabel(stop: Stop, allStops: Stop[]): string {
  const isDuplicateName =
    allStops.filter((s) => s.stop_name === stop.stop_name).length > 1;

  return isDuplicateName
    ? `${stop.stop_name} (${stop.district ?? stop.stop_id})`
    : stop.stop_name;
}

/** Map of label (lowercased) -> Stop, for O(1) lookup from typed text. */
export function buildStopLabelIndex(
  stops: Stop[]
): { labelToStop: Map<string, Stop>; labels: { stop_id: string; label: string }[] } {
  const labelToStop = new Map<string, Stop>();
  const labels: { stop_id: string; label: string }[] = [];

  for (const s of stops) {
    const label = buildStopLabel(s, stops);
    labelToStop.set(label.trim().toLowerCase(), s);
    labels.push({ stop_id: s.stop_id, label });
  }

  return { labelToStop, labels };
}
