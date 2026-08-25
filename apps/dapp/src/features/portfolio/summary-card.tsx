"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { WalletAvatar } from "@/components/icons";
import { Sparkline } from "@/components/sparkline";
import { useChartNow } from "@/hooks/use-now";
import { SPARK_POINTS } from "@/lib/charts";
import { fmtUsdc, truncateAddress } from "@/lib/format";

import { portfolioValueSeries, usePortfolioRows } from "./use-rows";

/** Shimmer while the wallet SDK restores a session. Node-for-node copy
    of the real banner below so the swap causes zero layout shift. */
function SummarySkeleton() {
  return (
    <phantom-ui loading aria-hidden>
      <section className="mt-4 rounded-2xl border border-line bg-white p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="size-9 rounded-full bg-shade" />
            <div className="text-xl font-medium tracking-tight">Welcome, 0x0000...0000</div>
          </div>
          <span className="text-sm font-medium">View Full Portfolio</span>
        </div>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-8">
          <div>
            <div className="text-sm">Total Invested</div>
            <div className="tabular mt-1 text-4xl font-medium tracking-tight">$0.00</div>
            <div className="tabular mt-3 font-mono text-xs">$0.00 claimable · 0 bonds held</div>
          </div>
          <div className="hidden h-20 w-full max-w-[55%] flex-1 self-center rounded-lg bg-shade md:block" />
        </div>
      </section>
    </phantom-ui>
  );
}

/** Explore-page banner for a connected wallet — the template's portfolio
    summary card with Sowee's position totals slotted in. */
export function PortfolioSummaryCard() {
  const { address, booting, rows } = usePortfolioRows();
  const chartNow = useChartNow();
  if (booting) return <SummarySkeleton />;
  if (!address) return null;

  const invested = rows.reduce((sum, r) => sum + r.costUsdc, 0);
  const claimable = rows.reduce((sum, r) => sum + r.claimableUsdc, 0);
  const spark = portfolioValueSeries(rows, "ALL", chartNow, SPARK_POINTS).map((p) => p.value);

  return (
    <section className="mt-4 rounded-2xl border border-line bg-white p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <WalletAvatar className="size-9" />
          <h2 className="text-xl font-medium tracking-tight">
            Welcome, {truncateAddress(address)}
          </h2>
        </div>
        <Link
          href="/portfolio"
          className="flex items-center gap-2 text-sm font-medium hover:underline"
        >
          View Full Portfolio <ArrowRight size={16} />
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-8">
        <div>
          <div className="text-sm text-soft">Total Invested</div>
          <div className="tabular mt-1 text-4xl font-medium tracking-tight">
            {fmtUsdc(invested)}
          </div>
          <div className="tabular mt-3 font-mono text-xs text-soft">
            {fmtUsdc(claimable)} claimable · {rows.length} bond{rows.length === 1 ? "" : "s"} held
          </div>
        </div>
        {/* Mini value chart: the wallet's accreted portfolio value since first purchase. */}
        <div className="hidden h-20 w-full max-w-[55%] flex-1 self-center md:block">
          <Sparkline values={spark} trend={rows.length > 0 ? "up" : "flat"} />
        </div>
      </div>
    </section>
  );
}
