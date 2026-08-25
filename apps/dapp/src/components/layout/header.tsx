import Image from "next/image";
import Link from "next/link";

const BACKOFFICE_URL = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? "https://bo-lp.ifajar.dev";

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/portfolio", label: "Portfolio" },
];

export function Header() {
  return (
    <header className="border-line/60 sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Image src="/lp-logo.png" alt="LP Bot" width={24} height={24} className="size-6 rounded-md" />
            LP Bot
          </Link>
          <nav className="hidden gap-4 text-sm text-soft sm:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:text-ink">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <a
          href={BACKOFFICE_URL}
          className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white"
        >
          Dashboard
        </a>
      </div>
    </header>
  );
}
