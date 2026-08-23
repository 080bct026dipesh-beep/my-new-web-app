"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Search" },
  { href: "/routes", label: "Routes" },
  { href: "/stops", label: "Stops" },
];

// Persisted so a minimized bar stays minimized across page loads/navigation
// instead of popping back open every time -- the whole point is reclaiming
// vertical space (especially on the map-first home page on mobile), which
// resetting on every navigation would undermine.
const STORAGE_KEY = "ktm-transit:navbar-minimized";

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      style={{ transform: direction === "up" ? "rotate(180deg)" : undefined }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * Slim top bar, shared via app/layout.tsx. Kept intentionally minimal --
 * no dashboard chrome -- since the map-first home page is still the
 * primary surface; this just gives /routes and /stops a way back and a
 * consistent brand mark.
 *
 * Minimize/restore collapses this down to a sliver with just the brand
 * mark and a restore control, for anyone who wants the full viewport back
 * (most useful on the home page's map, especially on small screens).
 */
export default function NavBar() {
  const pathname = usePathname();

  // Starts expanded on every render (server and first client render must
  // match, and localStorage isn't available during SSR); synced from
  // storage right after mount, so there's a one-frame flash of "expanded"
  // for anyone who'd previously minimized it, rather than a hydration
  // mismatch.
  const [minimized, setMinimized] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Deferred a tick (rather than calling setState synchronously in the
    // effect body) so this reads as "sync from an external system on a
    // later tick," matching the pattern used elsewhere in this codebase
    // (see useGeolocation's mount-time effect) instead of a same-commit
    // cascading update.
    const timer = setTimeout(() => {
      setMinimized(window.localStorage.getItem(STORAGE_KEY) === "1");
      setHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  function toggleMinimized() {
    const next = !minimized;
    setMinimized(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Storage unavailable (private browsing, quota) -- the toggle still
      // works for this session, it just won't persist across reloads.
    }
  }

  if (minimized && hydrated) {
    return (
      <header className="flex h-7 shrink-0 items-center justify-between border-b border-route-line bg-surface px-4">
        <Link href="/" className="flex items-center gap-1.5 text-xs font-semibold tracking-tight">
          <span aria-hidden>🚌</span>
          <span className="text-ink">KTM</span>
          <span className="text-accent-blue">TRANSIT</span>
        </Link>
        <button
          type="button"
          onClick={toggleMinimized}
          aria-label="Restore navigation bar"
          title="Restore navigation bar"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-secondary hover:text-ink"
        >
          <ChevronIcon direction="down" />
        </button>
      </header>
    );
  }

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-route-line bg-surface px-4">
      <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
        <span aria-hidden>🚌</span>
        <span className="text-ink">KTM</span>
        <span className="text-accent-blue">TRANSIT</span>
      </Link>
      <nav className="flex items-center gap-5 text-sm">
        {LINKS.map((link) => {
          const isActive =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={`border-b-2 pb-[3px] transition-colors ${
                isActive
                  ? "border-accent-blue font-medium text-ink"
                  : "border-transparent text-ink-secondary hover:text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3">
        <span className="hidden items-center gap-1.5 text-xs text-ink-secondary sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-green" aria-hidden />
          Kathmandu
        </span>
        <button
          type="button"
          onClick={toggleMinimized}
          aria-label="Minimize navigation bar"
          title="Minimize navigation bar"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-ink-secondary hover:text-ink"
        >
          <ChevronIcon direction="up" />
        </button>
      </div>
    </header>
  );
}
