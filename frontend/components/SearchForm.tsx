"use client";

import { useMemo, useState } from "react";
import { Stop, StopPickTarget } from "@/types/route";
import { buildStopLabelIndex } from "@/lib/stopLabel";

interface SearchFormProps {
  stops: Stop[];
  stopsLoading?: boolean;
  onSearch: (originId: string, destinationId: string) => void;
  loading?: boolean;
  // Map-click stop picking is owned by the parent (it also drives the map),
  // so origin/destination text are controlled from there rather than kept
  // as local state here.
  originText: string;
  destinationText: string;
  onOriginTextChange: (value: string) => void;
  onDestinationTextChange: (value: string) => void;
  pickTarget: StopPickTarget;
  onPickTargetChange: (target: StopPickTarget) => void;
  locating?: boolean;
  locateError?: string | null;
  onUseMyLocation: () => void;
}

type FieldError = "origin" | "destination" | "both" | null;

export default function SearchForm({
  stops,
  stopsLoading,
  onSearch,
  loading,
  originText,
  destinationText,
  onOriginTextChange,
  onDestinationTextChange,
  pickTarget,
  onPickTargetChange,
  locating = false,
  locateError = null,
  onUseMyLocation,
}: SearchFormProps) {
  const [fieldError, setFieldError] = useState<FieldError>(null);

  // See lib/stopLabel.ts -- must stay identical to how page.tsx labels a
  // picked Stop (map click, geolocation, "use my location"), or typed
  // text and programmatically-set text would resolve differently.
  const { labelToStop, labels } = useMemo(() => buildStopLabelIndex(stops), [stops]);

  function resolveStop(typedLabel: string): Stop | null {
    return labelToStop.get(typedLabel.trim().toLowerCase()) ?? null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const origin = resolveStop(originText);
    const destination = resolveStop(destinationText);

    if (!origin && !destination) {
      setFieldError("both");
      return;
    }
    if (!origin) {
      setFieldError("origin");
      return;
    }
    if (!destination) {
      setFieldError("destination");
      return;
    }
    if (origin.stop_id === destination.stop_id) {
      setFieldError("both");
      return;
    }

    setFieldError(null);
    onSearch(origin.stop_id, destination.stop_id);
  }

  function handleSwap() {
    onOriginTextChange(destinationText);
    onDestinationTextChange(originText);
    setFieldError(null);
  }

  function togglePick(target: "origin" | "destination") {
    onPickTargetChange(pickTarget === target ? null : target);
  }

  const originInvalid = fieldError === "origin" || fieldError === "both";
  const destinationInvalid = fieldError === "destination" || fieldError === "both";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-lg bg-route-panel p-4">
      {pickTarget && (
        <p className="rounded-md border border-route-accent/40 bg-route-accent/10 px-3 py-2 text-xs text-route-accent">
          Tap a stop on the map to set your {pickTarget === "origin" ? "origin" : "destination"}.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor="origin" className="text-xs uppercase tracking-wide text-neutral-400">
            From
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onUseMyLocation}
              disabled={locating}
              className="text-xs text-route-accent hover:underline disabled:opacity-50"
            >
              {locating ? "Locating…" : "Use my location"}
            </button>
            <button
              type="button"
              onClick={() => togglePick("origin")}
              aria-pressed={pickTarget === "origin"}
              className={`text-xs hover:underline ${
                pickTarget === "origin" ? "font-semibold text-route-accent" : "text-neutral-400"
              }`}
            >
              {pickTarget === "origin" ? "Picking…" : "Pick on map"}
            </button>
          </div>
        </div>
        <input
          id="origin"
          list="stop-options"
          value={originText}
          onChange={(e) => {
            onOriginTextChange(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          placeholder={stopsLoading ? "Loading stops…" : "Origin stop"}
          autoComplete="off"
          aria-invalid={originInvalid}
          className={`rounded-md border bg-route-bg px-3 py-2 text-sm outline-none focus:border-route-accent ${
            originInvalid ? "border-red-700" : "border-route-line"
          }`}
        />
      </div>

      <div className="-my-1 flex justify-center">
        <button
          type="button"
          onClick={handleSwap}
          aria-label="Swap origin and destination"
          title="Swap origin and destination"
          className="rounded-full border border-route-line bg-route-bg px-2 py-1 text-xs text-neutral-400 hover:border-route-accent hover:text-route-accent"
        >
          ↕ Swap
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <label htmlFor="destination" className="text-xs uppercase tracking-wide text-neutral-400">
            To
          </label>
          <button
            type="button"
            onClick={() => togglePick("destination")}
            aria-pressed={pickTarget === "destination"}
            className={`text-xs hover:underline ${
              pickTarget === "destination" ? "font-semibold text-route-accent" : "text-neutral-400"
            }`}
          >
            {pickTarget === "destination" ? "Picking…" : "Pick on map"}
          </button>
        </div>
        <input
          id="destination"
          list="stop-options"
          value={destinationText}
          onChange={(e) => {
            onDestinationTextChange(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          placeholder={stopsLoading ? "Loading stops…" : "Destination stop"}
          autoComplete="off"
          aria-invalid={destinationInvalid}
          className={`rounded-md border bg-route-bg px-3 py-2 text-sm outline-none focus:border-route-accent ${
            destinationInvalid ? "border-red-700" : "border-route-line"
          }`}
        />
      </div>

      {/* Fine for small stop counts. If the full stop list is large,
          swap this for a debounced /stops?search= call instead. */}
      <datalist id="stop-options">
        {labels.map(({ stop_id, label }) => (
          <option key={stop_id} value={label} />
        ))}
      </datalist>

      {fieldError && (
        <p className="text-xs text-red-400" role="alert">
          {fieldError === "both" && originText.trim() && originText === destinationText
            ? "Origin and destination can't be the same stop."
            : "Pick a valid stop from the suggestions for both fields."}
        </p>
      )}
      {locateError && (
        <p className="text-xs text-red-400" role="alert">
          {locateError}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 rounded-md bg-route-accent py-2 text-sm font-medium text-route-bg disabled:opacity-50"
      >
        {loading ? "Searching…" : "Find route"}
      </button>
    </form>
  );
}
