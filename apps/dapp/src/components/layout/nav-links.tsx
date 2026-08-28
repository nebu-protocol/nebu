"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useT } from "../../lib/i18n-client";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/status", label: "Status" },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/** Nav desktop dengan highlight halaman aktif (item = ink, lainnya soft). */
export function NavLinks() {
  const pathname = usePathname();
  const t = useT();
  return (
    <nav className="hidden gap-4 text-sm sm:flex">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={isActive(pathname, n.href) ? "font-medium text-ink" : "text-soft hover:text-ink"}
        >
          {t(n.label)}
        </Link>
      ))}
    </nav>
  );
}

/** Hamburger menu untuk mobile (<sm) — buka panel berisi NAV. Tutup saat klik luar / pilih item. */
export function MobileNav() {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-line/60 hover:bg-shade"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-2xl border border-line/60 bg-white p-2 shadow-xl">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              className={`block rounded-xl px-3 py-2.5 text-sm ${
                isActive(pathname, n.href) ? "bg-shade font-medium text-ink" : "text-soft hover:bg-shade hover:text-ink"
              }`}
            >
              {t(n.label)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
