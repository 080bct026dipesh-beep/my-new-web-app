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
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-route-line bg-route-panel px-4">
      <Link href="/" className="flex items-center gap-1.5 text-sm font-semibold">
        🚌 <span>KTM Bus</span>
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {LINKS.map((link) => {
          const isActive =
            link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "font-medium text-route-accent"
                  : "text-neutral-400 hover:text-neutral-200"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
