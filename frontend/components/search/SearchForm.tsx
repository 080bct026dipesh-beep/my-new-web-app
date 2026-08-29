"use client";

import { useMemo, useState } from "react";
import { Stop, StopPickTarget } from "@/types/route";
import { buildStopLabel, buildStopLabelIndex } from "@/lib/stopLabel";
import StopAutocomplete from "./StopAutocomplete";
import { CrosshairIcon, LocationIcon, SwapIcon } from "@/components/icons/TransitIcons";

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

  // See lib/stopLabel.ts -- must stay identical to how the parent labels a
  // picked Stop (map click, geolocation, "use my location"), or typed
  // text and programmatically-set text would resolve differently.
  const { labelToStop } = useMemo(() => buildStopLabelIndex(stops), [stops]);

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
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-route-line bg-surface-raised p-3 shadow-card"
    >
      {pickTarget && (
        <p className="rounded-md border border-accent-blue/30 bg-accent-blue/5 px-3 py-2 text-xs text-accent-blue">
          Tap a stop on the map to set your {pickTarget === "origin" ? "origin" : "destination"}.
        </p>
      )}

      <div className="relative flex gap-2.5">
        {/* Shared origin -> destination connector: blue dot, dashed line,
            red dot -- read at a glance without a per-field label. */}
        <div className="flex w-3 shrink-0 flex-col items-center pt-3.5" aria-hidden>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-blue" />
          <span className="my-1 w-px flex-1 border-l border-dashed border-route-line" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-red" />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2 pr-9">
          <StopAutocomplete
            id="origin"
            label="From"
            stops={stops}
            stopsLoading={stopsLoading}
            value={originText}
            onChange={(v) => {
              onOriginTextChange(v);
              if (fieldError) setFieldError(null);
            }}
            onSelect={(stop) => {
              onOriginTextChange(buildStopLabel(stop, stops));
              setFieldError(null);
            }}
            invalid={originInvalid}
            placeholder="From: search starting stop…"
            footerActions={
              <>
                <button
                  type="button"
                  onClick={onUseMyLocation}
                  disabled={locating}
                  className="inline-flex items-center gap-1 text-xs text-accent-blue hover:underline disabled:opacity-50"
                >
                  <LocationIcon size={12} />
                  {locating ? "Locating…" : "Use my location"}
                </button>
                <button
                  type="button"
                  onClick={() => togglePick("origin")}
                  aria-pressed={pickTarget === "origin"}
                  className={`inline-flex items-center gap-1 text-xs hover:underline ${
                    pickTarget === "origin" ? "font-semibold text-accent-blue" : "text-ink-secondary"
                  }`}
                >
                  <CrosshairIcon size={12} />
                  {pickTarget === "origin" ? "Picking…" : "Pick on map"}
                </button>
              </>
            }
          />

          <StopAutocomplete
            id="destination"
            label="To"
            stops={stops}
            stopsLoading={stopsLoading}
            value={destinationText}
            onChange={(v) => {
              onDestinationTextChange(v);
              if (fieldError) setFieldError(null);
            }}
            onSelect={(stop) => {
              onDestinationTextChange(buildStopLabel(stop, stops));
              setFieldError(null);
            }}
            invalid={destinationInvalid}
            placeholder="To: search destination…"
            footerActions={
              <button
                type="button"
                onClick={() => togglePick("destination")}
                aria-pressed={pickTarget === "destination"}
                className={`inline-flex items-center gap-1 text-xs hover:underline ${
                  pickTarget === "destination" ? "font-semibold text-accent-red" : "text-ink-secondary"
                }`}
              >
                <CrosshairIcon size={12} />
                {pickTarget === "destination" ? "Picking…" : "Pick on map"}
              </button>
            }
          />
        </div>

        <button
          type="button"
          onClick={handleSwap}
          aria-label="Swap origin and destination"
          title="Swap origin and destination"
          className="absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-route-line bg-white text-ink-secondary shadow-card hover:border-accent-blue hover:text-accent-blue"
        >
          <SwapIcon size={15} />
        </button>
      </div>

      {fieldError && (
        <p className="text-xs text-accent-red" role="alert">
          {fieldError === "both" && originText.trim() && originText === destinationText
            ? "Origin and destination can't be the same stop."
            : "Pick a valid stop from the suggestions for both fields."}
        </p>
      )}
      {locateError && (
        <p className="text-xs text-accent-red" role="alert">
          {locateError}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 rounded-md bg-accent-blue py-2.5 text-sm font-semibold tracking-wide text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Searching…" : "Find route"}
      </button>
    </form>
  );
}
