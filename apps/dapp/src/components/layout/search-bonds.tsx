"use client";

// The template's header search (search-assets.tsx) verbatim, with bond
// listings as the suggestion source instead of the asset API.

import { Search, TrendingUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { CompanyAvatar, TrendText } from "@/components/icons";
import { Sheet } from "@/components/sheet";
import { useOutsideClick } from "@/hooks/use-outside-click";
import { fmtPct, fmtUsdc } from "@/lib/format";
import { useBonds } from "@/lib/live/hooks";
import { filterBonds, type InvoiceBond, impliedApyPct } from "@/lib/mock";

function SuggestionRow({ bond, onSelect }: Readonly<{ bond: InvoiceBond; onSelect: () => void }>) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left hover:bg-shade"
    >
      <CompanyAvatar name={bond.issuer} className="size-9 text-xs" />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{bond.issuer}</div>
        <div className="truncate text-xs text-soft">Payor: {bond.payor}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="tabular text-sm font-medium">{fmtUsdc(bond.faceValueUsdc)}</div>
        <TrendText trend="up" arrowSize={8} className="justify-end text-[11px]">
          {fmtPct(impliedApyPct(bond))} APY
        </TrendText>
      </div>
    </button>
  );
}

/** Top-APY bonds when the query is empty, live results otherwise. */
function Suggestions({
  q,
  onSelect,
}: Readonly<{ q: string; onSelect: (bond: InvoiceBond) => void }>) {
  const { data } = useBonds();
  const trending = q.trim() === "";
  const bonds = filterBonds(data ?? [], { q, sort: "apy" }).slice(0, 5);

  return (
    <div>
      {trending && (
        <div className="flex items-center gap-2 px-2 pt-1 pb-2 text-sm text-soft">
          <TrendingUp size={15} />
          Trending
        </div>
      )}
      {bonds.map((b) => (
        <SuggestionRow key={b.id} bond={b} onSelect={() => onSelect(b)} />
      ))}
      {!trending && bonds.length === 0 && (
        <p className="px-2 py-4 text-sm text-soft">No invoice bonds found.</p>
      )}
    </div>
  );
}

/** Desktop: search input with a suggestions popover. */
export function HeaderSearch({ className = "" }: Readonly<{ className?: string }>) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closePopover = useCallback(() => setOpen(false), []);
  useOutsideClick(ref, closePopover, open);

  const go = (bond: InvoiceBond) => {
    setOpen(false);
    setQ("");
    router.push(`/invoices/${bond.id}`);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape/blur dismissal for the popover; the input is the interactive element
    <div
      ref={ref}
      className={`relative ${className}`}
      onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
      onBlur={(e) => {
        // Tabbing out of the widget should close the popover too.
        if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
        }}
      >
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-soft"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true); // typing after Escape reopens the popover
          }}
          onFocus={() => setOpen(true)}
          aria-label="Search invoice bonds"
          placeholder="Search invoice bonds"
          className="h-10 w-full rounded-full border border-transparent bg-shade pr-4 pl-10 text-sm outline-none placeholder:text-faint focus:border-ink"
        />
      </form>
      {open && (
        <div className="absolute inset-x-0 top-12 z-40 rounded-2xl border border-line bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.12)]">
          <Suggestions q={q} onSelect={go} />
        </div>
      )}
    </div>
  );
}

/** Mobile: a search icon that opens a full sheet. */
export function MobileSearch({ className = "" }: Readonly<{ className?: string }>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const close = useCallback(() => setOpen(false), []);

  const go = (bond: InvoiceBond) => {
    setOpen(false);
    setQ("");
    router.push(`/invoices/${bond.id}`);
  };

  return (
    <div className={className}>
      <button
        type="button"
        aria-label="Search invoice bonds"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-shade"
      >
        <Search size={17} />
      </button>
      <Sheet
        open={open}
        onClose={close}
        closeLabel="Close search"
        panelClassName="flex max-h-[92svh] flex-col p-4"
      >
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-xl font-medium">Search</h2>
          <button
            type="button"
            aria-label="Close search"
            onClick={close}
            className="flex size-9 items-center justify-center rounded-full text-soft hover:bg-shade"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          <Suggestions q={q} onSelect={go} />
        </div>
        <div className="relative pt-2">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-4 translate-y-[-30%] text-soft"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search issuer or payor"
            placeholder="Search issuer or payor"
            className="h-11 w-full rounded-xl border border-transparent bg-shade pr-4 pl-10 text-sm outline-none placeholder:text-faint focus:border-ink"
          />
        </div>
      </Sheet>
    </div>
  );
}
