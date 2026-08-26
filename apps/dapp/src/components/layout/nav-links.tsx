"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/leaderboard", label: "Leaderboard" },
];

/** Nav dengan highlight halaman aktif (item = ink, lainnya soft). */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="hidden gap-4 text-sm sm:flex">
      {NAV.map((n) => {
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={active ? "font-medium text-ink" : "text-soft hover:text-ink"}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
