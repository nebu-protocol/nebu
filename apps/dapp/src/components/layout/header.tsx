"use client";

import { Check, Copy, Globe, LogOut, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { WalletAvatar } from "@/components/icons";
import { HeaderSearch, MobileSearch } from "@/components/layout/search-bonds";
import { Sheet } from "@/components/sheet";
import { useWallet } from "@/features/wallet/wallet-provider";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { truncateAddress } from "@/lib/format";

const NAV = [
  { href: "/", label: "Marketplace" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/issuer", label: "Issuer" },
];

const isActive = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname.startsWith(href);

/** Connected-wallet pill with a Copy Address / Disconnect menu. */
function WalletMenu({
  address,
  disconnect,
}: Readonly<{ address: string; disconnect: () => void }>) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, closeMenu, open);

  const copyAddress = async () => {
    if (!navigator.clipboard) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape-dismiss for the popover; the trigger button is the interactive element
    <div ref={ref} className="relative" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-2 rounded-full bg-shade px-4 py-2 font-mono text-xs hover:bg-line"
      >
        <WalletAvatar className="size-4" />
        {truncateAddress(address)}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-2xl border border-line bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.10)]">
          <div className="flex items-center gap-2 px-2 py-2">
            <WalletAvatar className="size-6" />
            <span className="font-mono text-xs">{truncateAddress(address)}</span>
          </div>
          <div className="mt-1 rounded-xl bg-shade/60 p-1">
            <button
              type="button"
              onClick={copyAddress}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy Address"}
            </button>
            <button
              type="button"
              onClick={disconnect}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white"
            >
              <LogOut size={14} />
              Disconnect Wallet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Mobile: hamburger button opening a nav sheet. */
function MobileMenu({ className = "" }: Readonly<{ className?: string }>) {
  const pathname = usePathname();
  const { address, booting, connect } = useWallet();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const linkClass = (active: boolean) =>
    `rounded-xl px-3 py-3 text-[15px] ${
      active ? "bg-shade font-medium text-ink" : "text-body hover:bg-shade"
    }`;

  return (
    <div className={className}>
      <button
        type="button"
        aria-label="Menu"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-shade"
      >
        <Menu size={19} />
      </button>
      <Sheet open={open} onClose={close} closeLabel="Close menu" panelClassName="p-4 pb-6">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-xl font-medium">Menu</h2>
          <button
            type="button"
            aria-label="Close menu"
            onClick={close}
            className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-shade"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className={linkClass(isActive(pathname, item.href))}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {!address && !booting && (
          <button
            type="button"
            onClick={() => {
              close();
              connect();
            }}
            className="mt-3 h-12 w-full rounded-xl border border-line text-sm font-medium hover:border-ink"
          >
            Connect Wallet
          </button>
        )}
      </Sheet>
    </div>
  );
}

/** Wallet slot: skeleton while a session restores, then pill or button. */
function WalletSlot() {
  const { address, booting, connect, disconnect } = useWallet();
  if (booting) {
    // Mirrors the WalletMenu pill exactly so the swap doesn't shift.
    return (
      <phantom-ui loading aria-hidden>
        <span className="flex items-center gap-2 rounded-full bg-shade px-4 py-2 font-mono text-xs">
          <span className="size-4 rounded-full bg-shade" />
          0x0000...0000
        </span>
      </phantom-ui>
    );
  }
  if (address) return <WalletMenu address={address} disconnect={disconnect} />;
  return (
    <button
      type="button"
      onClick={connect}
      className="hidden rounded-full bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black sm:block"
    >
      Connect Wallet
    </button>
  );
}

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="container-page flex h-16 items-center gap-5">
        <Link href="/" aria-label="Home" className="flex shrink-0 items-center gap-2.5">
          <Image
            src="/favicons/black/android-chrome-192x192.png"
            alt="Sowee"
            width={28}
            height={28}
            priority
          />
          <span className="text-[17px] font-medium tracking-tight">Sowee</span>
        </Link>

        <nav className="hidden items-center gap-5 lg:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm ${
                isActive(pathname, item.href) ? "font-medium text-ink" : "text-soft hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <HeaderSearch className="mx-auto hidden w-full max-w-110 md:block" />

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <MobileSearch className="md:hidden" />
          <button
            type="button"
            aria-label="Language"
            className="hidden size-9 items-center justify-center rounded-full bg-shade text-soft hover:bg-line sm:flex"
          >
            <Globe size={17} />
          </button>
          <WalletSlot />
          <MobileMenu className="lg:hidden" />
        </div>
      </div>
    </header>
  );
}
