"use client";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOUR_BUCKETS = [0, 3, 6, 9, 12, 15, 18, 21];

function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${period}`;
}

interface CongestionPanelProps {
  enabled: boolean;
  onToggle: () => void;
  // null = "now" (server picks the current Nepal-time bucket); a picked
  // value overrides it so the user can browse other times of day.
  dayOfWeek: number | null;
  hourBucket: number | null;
  onDayChange: (day: number | null) => void;
  onHourChange: (hour: number | null) => void;
  loading?: boolean;
  segmentCount: number;
  hasSeededOnly: boolean;
}

export default function CongestionPanel({
  enabled,
  onToggle,
  dayOfWeek,
  hourBucket,
  onDayChange,
  onHourChange,
  loading,
  segmentCount,
  hasSeededOnly,
}: CongestionPanelProps) {
  const isCustomTime = dayOfWeek !== null || hourBucket !== null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-route-line bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-orange">
            Traffic conditions
          </p>
          <p className="mt-0.5 text-xs text-ink-secondary">Historical traffic pattern</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={enabled}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            enabled
              ? "bg-accent-orange text-white"
              : "border border-route-line text-ink-secondary hover:border-accent-orange hover:text-accent-orange"
          }`}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>

      {enabled && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={dayOfWeek ?? "now"}
              onChange={(e) => onDayChange(e.target.value === "now" ? null : Number(e.target.value))}
              className="rounded-md border border-route-line bg-white px-2 py-1 text-ink"
            >
              <option value="now">Today</option>
              {DAY_LABELS.map((label, i) => (
                <option key={label} value={i}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={hourBucket ?? "now"}
              onChange={(e) => onHourChange(e.target.value === "now" ? null : Number(e.target.value))}
              className="rounded-md border border-route-line bg-white px-2 py-1 text-ink"
            >
              <option value="now">Now</option>
              {HOUR_BUCKETS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}–{formatHour((h + 3) % 24)}
                </option>
              ))}
            </select>
            {isCustomTime && (
              <button
                type="button"
                onClick={() => {
                  onDayChange(null);
                  onHourChange(null);
                }}
                className="text-accent-orange hover:underline"
              >
                Reset to now
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 text-xs text-ink-secondary">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#16A34A" }} />
              Low
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#F59E0B" }} />
              Moderate
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#EF4444" }} />
              Heavy
            </span>
          </div>

          <p className="font-mono text-xs text-ink-secondary">
            {loading
              ? "Loading…"
              : segmentCount === 0
              ? "No congestion data for this segment/time yet."
              : `${segmentCount} segment${segmentCount === 1 ? "" : "s"} with data.${
                  hasSeededOnly ? " (baseline estimate, not yet confirmed by real traffic)" : ""
                }`}
          </p>
        </>
      )}
    </div>
  );
}
