"use client";

import { Search, Zap } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";

import { BondCard } from "@/components/bond-card";
import { BondCardSkeleton } from "@/components/bond-card-skeleton";
import { Dropdown } from "@/components/dropdown";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { PortfolioSummaryCard } from "@/features/portfolio/summary-card";
import { DEMO_DATA } from "@/lib/live/chain";
import { useBonds } from "@/lib/live/hooks";
import { type BondSort, type BondStatus, filterBonds, type InvoiceBond } from "@/lib/mock";

import { Hero } from "./hero";
import { TopLists } from "./top-lists";

const CHIPS: { id: BondStatus | "all"; label: string }[] = [
  { id: "all", label: "All bonds" },
  { id: "open", label: "Funding" },
  { id: "funded", label: "Funded" },
  { id: "matured", label: "Matured" },
  { id: "settled", label: "Settled" },
];

const SORTS: { id: BondSort; label: string }[] = [
  { id: "apy", label: "Highest APY" },
  { id: "maturity", label: "Maturity: Soonest" },
  { id: "size", label: "Face Value: Largest" },
  { id: "newest", label: "Recently Issued" },
];

const PAGE_SIZE = 9;
const SKELETON_SLOTS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8", "s9"];

/**
 * Page numbers with gaps: 1 2 … c-1 c c+1 … n-1 n. Gap tokens are
 * "…<previous page>" so they stay unique and stable as React keys.
 */
function pageNumbers(current: number, pages: number): string[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => String(i + 1));
  const wanted = new Set([1, 2, current - 1, current, current + 1, pages - 1, pages]);
  const nums = [...wanted].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0 && nums[i] - nums[i - 1] > 1) out.push(`…${nums[i - 1]}`);
    out.push(String(nums[i]));
  }
  return out;
}

function emptyMessage(isError: boolean, listed: number): string {
  if (isError) return "Could not reach the Hedera mirror node — retrying shortly.";
  if (listed === 0)
    return "No invoice bonds are listed on Hedera testnet yet. New listings appear here the moment they hit the chain.";
  return "No bonds match your search or filters.";
}

function Pagination({
  current,
  pages,
  goTo,
}: Readonly<{ current: number; pages: number; goTo: (p: number) => void }>) {
  return (
    <nav aria-label="Pagination" className="mx-auto flex items-center gap-1">
      <button
        type="button"
        disabled={current === 1}
        onClick={() => goTo(current - 1)}
        className="px-3 py-2 text-sm text-body disabled:opacity-40"
      >
        Previous
      </button>
      {pageNumbers(current, pages).map((n) =>
        n.startsWith("…") ? (
          <span key={n} className="px-2 text-sm text-faint">
            …
          </span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => goTo(Number(n))}
            aria-current={Number(n) === current ? "page" : undefined}
            className={`size-9 rounded-full text-sm ${
              Number(n) === current ? "bg-ink font-medium text-white" : "text-body hover:bg-shade"
            }`}
          >
            {n}
          </button>
        ),
      )}
      <button
        type="button"
        disabled={current >= pages}
        onClick={() => goTo(current + 1)}
        className="px-3 py-2 text-sm text-body disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}

function ExploreBonds({
  initialQuery = "",
  bonds,
  isLoading,
  isError,
}: Readonly<{
  initialQuery?: string;
  bonds: InvoiceBond[];
  isLoading: boolean;
  isError: boolean;
}>) {
  const [q, setQ] = useState(initialQuery);
  const [chip, setChip] = useState<BondStatus | "all">("all");
  const [sort, setSort] = useState<BondSort>("apy");
  const [page, setPage] = useState(1);
  const sectionRef = useRef<HTMLElement>(null);

  const filtered = filterBonds(bonds, { q, status: chip, sort });
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pages);
  const items = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const start = total === 0 ? 0 : (current - 1) * PAGE_SIZE + 1;
  const end = Math.min(current * PAGE_SIZE, total);

  const resetPage = () => setPage(1);
  const goTo = (p: number) => {
    setPage(p);
    sectionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <section ref={sectionRef} className="mt-14 scroll-mt-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-medium tracking-tight">Explore Invoice Bonds</h2>
        {!isLoading && !isError && (
          <div
            className={`flex items-center gap-1.5 text-sm font-medium ${
              DEMO_DATA ? "text-soft" : "text-pos"
            }`}
          >
            <Zap size={15} fill="currentColor" strokeWidth={0} />
            {DEMO_DATA ? "Demo Data" : "Live on Hedera Testnet"}
          </div>
        )}
      </div>

      <div className="relative mt-5">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-soft"
        />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            resetPage();
          }}
          aria-label="Search issuer or payor"
          placeholder="Search issuer or payor"
          className="h-11 w-full rounded-full border border-line bg-white pr-4 pl-10 text-sm outline-none placeholder:text-faint focus:border-ink"
        />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="no-scrollbar flex flex-1 gap-2 overflow-x-auto">
          {CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setChip(c.id);
                resetPage();
              }}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition-colors ${
                chip === c.id
                  ? "border-ink bg-ink font-medium text-white"
                  : "border-line text-body hover:border-faint"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Dropdown
          value={sort}
          onChange={(v) => {
            setSort(v as BondSort);
            resetPage();
          }}
          options={SORTS.map((o) => ({ value: o.id, label: o.label }))}
          buttonClassName="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-faint"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading
          ? SKELETON_SLOTS.map((id) => <BondCardSkeleton key={id} />)
          : items.map((b) => <BondCard key={b.id} bond={b} />)}
      </div>

      {!isLoading && total === 0 && (
        <p className="py-16 text-center text-sm text-soft">{emptyMessage(isError, bonds.length)}</p>
      )}

      {!isLoading && total > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <span className="tabular text-sm text-soft">
            {start}-{end} of {total}
          </span>
          <Pagination current={current} pages={pages} goTo={goTo} />
        </div>
      )}
    </section>
  );
}

export function MarketplacePage() {
  const q = useSearchParams().get("q") ?? "";
  const { data, isLoading, isError } = useBonds();
  const all = data ?? [];

  return (
    <>
      <Header />
      <main className="container-page">
        <PortfolioSummaryCard />
        <Hero />
        <TopLists bonds={all} loading={isLoading} />
        <ExploreBonds
          key={q}
          initialQuery={q}
          bonds={all}
          isLoading={isLoading}
          isError={isError}
        />
      </main>
      <Footer />
    </>
  );
}
