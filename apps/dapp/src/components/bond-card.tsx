"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { CompanyAvatar, TrendText } from "@/components/icons";
import { Sparkline } from "@/components/sparkline";
import { StatusBadge } from "@/components/status-badge";
import { useInView } from "@/hooks/use-in-view";
import { useChartNow } from "@/hooks/use-now";
import { fmtPct, fmtUsdc, TREND_FILL, type Trend } from "@/lib/format";
import {
  type BondStatus,
  daysToMaturity,
  type InvoiceBond,
  impliedApyPct,
  sparklineSeries,
} from "@/lib/mock";

// Data layer: bond status mapped onto the template's trend palette (the
// card tint, sparkline, and change-row color are all keyed by Trend). Both
// series a card can show (funding, accretion) only ever rise, so no status
// maps to "down"; matured/settled sit at neutral gray while awaiting payout.
const STATUS_TREND: Record<BondStatus, Trend> = {
  pending: "flat",
  open: "up",
  funded: "up",
  matured: "flat",
  settled: "flat",
};

// Cards present at hydration render visible (LCP + crawler HTML); cards
// mounted later (pagination, related lists) play the viewport entrance.
let hydratedPage = false;

/** Marketplace card for one invoice bond — the template's AssetCard
    verbatim, with only the data layer swapped to invoice semantics. */
export function BondCard({ bond }: Readonly<{ bond: InvoiceBond }>) {
  const trend = STATUS_TREND[bond.status];
  const days = daysToMaturity(bond);
  const chartNow = useChartNow();
  const values = chartNow ? sparklineSeries(bond, chartNow) : null;
  const [ref, inView] = useInView<HTMLAnchorElement>();
  const [entrance] = useState(() => hydratedPage);
  useEffect(() => {
    hydratedPage = true;
  }, []);
  const hidden = entrance && !inView;

  return (
    <Link
      ref={ref}
      href={`/invoices/${bond.id}`}
      className={`asset-card block overflow-hidden rounded-3xl border border-line transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none ${
        hidden ? "translate-y-3 opacity-0" : "translate-y-0 opacity-100"
      }`}
      style={{ "--card-tint": TREND_FILL[trend] } as React.CSSProperties}
    >
      <div className="flex items-center gap-3 p-5 pb-0">
        <CompanyAvatar name={bond.issuer} />
        <div className="min-w-0">
          <div className="truncate text-[15px] font-medium">{bond.issuer}</div>
          <div className="truncate text-[13px] text-soft">Payor: {bond.payor}</div>
        </div>
        <StatusBadge status={bond.status} className="ml-auto" />
      </div>

      <div className="px-5 pt-4">
        <div className="tabular text-[28px] font-medium tracking-tight">
          {fmtUsdc(bond.faceValueUsdc)}
        </div>
        <TrendText trend={trend} className="mt-1 text-xs">
          {fmtPct(impliedApyPct(bond))} APY ({bond.fundedPct}% funded) {Math.max(days, 0)}D
        </TrendText>
      </div>

      {/* h-27.5 = 110px, coupled to the Sparkline viewBox height H */}
      <div className="mt-2 h-27.5">
        {values ? (
          <Sparkline values={values} trend={trend} animate={entrance ? inView : true} />
        ) : null}
      </div>
    </Link>
  );
}
