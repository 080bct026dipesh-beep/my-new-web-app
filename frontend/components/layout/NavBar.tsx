"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Search" },
  { href: "/routes", label: "Routes" },
  { href: "/stops", label: "Stops" },
];

/**
 * Slim top bar, shared via app/layout.tsx. Kept intentionally minimal --
 * no dashboard chrome -- since the map-first home page is still the
 * primary surface; this just gives /routes and /stops a way back and a
 * consistent brand mark.
 */
export default function NavBar() {
  const pathname = usePathname();

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
      <span className="hidden items-center gap-1.5 text-xs text-ink-secondary sm:flex">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-green" aria-hidden />
        Kathmandu
      </span>
    </header>
  );
}
