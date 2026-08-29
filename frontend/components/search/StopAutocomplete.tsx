"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Stop } from "@/types/route";
import { buildStopLabel } from "@/lib/stopLabel";
import { PinDotIcon } from "@/components/icons/TransitIcons";

interface StopAutocompleteProps {
  id: string;
  label: string;
  stops: Stop[];
  stopsLoading?: boolean;
  value: string;
  onChange: (value: string) => void;
  onSelect: (stop: Stop) => void;
  invalid?: boolean;
  placeholder?: string;
  /** Extra buttons rendered under the field, e.g. "Use my location". */
  footerActions?: React.ReactNode;
}

const MAX_RESULTS = 8;

/**
 * Custom autocomplete over the stop list -- replaces the native
 * <datalist>, which doesn't support inline highlighting, an empty state,
 * or reliable mobile behavior. Matches on stop name and district (the
 * only searchable text fields StopOut actually exposes).
 *
 * Renders as a bare input (label is visually hidden, not shown as its own
 * row) so SearchForm can stack From/To against one shared connector line
 * instead of each field carrying its own header.
 */
export default function StopAutocomplete({
  id,
  label,
  stops,
  stopsLoading,
  value,
  onChange,
  onSelect,
  invalid,
  placeholder,
  footerActions,
}: StopAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = `${id}-listbox`;

  const results = useMemo(() => {
    const query = value.trim().toLowerCase();
    if (!query) return [];

    const seen = new Set<string>();
    const matches: { stop: Stop; label: string }[] = [];
    for (const stop of stops) {
      if (matches.length >= MAX_RESULTS) break;
      if (seen.has(stop.stop_id)) continue;
      const nameMatch = stop.stop_name.toLowerCase().includes(query);
      const districtMatch = stop.district?.toLowerCase().includes(query) ?? false;
      if (nameMatch || districtMatch) {
        seen.add(stop.stop_id);
        matches.push({ stop, label: buildStopLabel(stop, stops) });
      }
    }
    return matches;
  }, [value, stops]);

  // Reset highlight to the top match whenever the candidate list changes,
  // computed directly during render (no effect needed) by keying off the
  // query text that produced the current `results`.
  const [lastQueryForHighlight, setLastQueryForHighlight] = useState(value);
  if (lastQueryForHighlight !== value) {
    setLastQueryForHighlight(value);
    if (highlightedIndex !== 0) setHighlightedIndex(0);
  }

  // Close on outside click.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectStop(stop: Stop) {
    onSelect(stop);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setIsOpen(true);
      return;
    }
    if (!isOpen || results.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const match = results[highlightedIndex];
      if (match) selectStop(match.stop);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  const showEmptyState = isOpen && value.trim().length > 0 && results.length === 0;

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>

      <div className="relative flex items-center">
        <input
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && results[highlightedIndex] ? `${id}-option-${highlightedIndex}` : undefined
          }
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => value.trim() && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={stopsLoading ? "Loading stops…" : placeholder}
          autoComplete="off"
          aria-invalid={invalid}
          className={`w-full rounded-md border bg-surface-raised py-2.5 pl-3 pr-8 text-sm text-ink outline-none transition-colors focus:border-accent-blue focus:bg-white ${
            invalid ? "border-accent-red" : "border-route-line"
          }`}
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setIsOpen(false);
            }}
            aria-label={`Clear ${label.toLowerCase()}`}
            className="absolute right-2 flex h-5 w-5 items-center justify-center rounded-full text-ink-tertiary hover:bg-surface-sunken hover:text-ink"
          >
            ×
          </button>
        )}

        {isOpen && (results.length > 0 || showEmptyState) && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-route-line bg-white shadow-card"
          >
            {results.map((match, i) => (
              <li
                id={`${id}-option-${i}`}
                key={match.stop.stop_id}
                role="option"
                aria-selected={i === highlightedIndex}
                onMouseDown={(e) => {
                  // mousedown (not click) so it fires before the input's
                  // blur/outside-click handler closes the list.
                  e.preventDefault();
                  selectStop(match.stop);
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`flex cursor-pointer items-start gap-2 px-3 py-2 text-sm ${
                  i === highlightedIndex ? "bg-accent-blue/10 text-accent-blue" : "text-ink"
                }`}
              >
                <PinDotIcon size={7} className="mt-1.5 shrink-0 text-ink-tertiary" />
                <div className="min-w-0">
                  <p className="truncate font-medium">{match.stop.stop_name}</p>
                  {match.stop.district && (
                    <p className="truncate text-xs text-ink-secondary">{match.stop.district}</p>
                  )}
                </div>
              </li>
            ))}
            {showEmptyState && (
              <li className="px-3 py-3 text-sm text-ink-secondary">
                No stops match &quot;{value.trim()}&quot;.
              </li>
            )}
          </ul>
        )}
      </div>

      {footerActions && <div className="flex items-center gap-3 pl-0.5">{footerActions}</div>}
    </div>
  );
}
