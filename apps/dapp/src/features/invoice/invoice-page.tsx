"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { type ChartRange, PriceChart, RANGE_MS, RangeTabs } from "@/components/charts/price-chart";
import { CompanyAvatar } from "@/components/icons";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { Sheet } from "@/components/sheet";
import { StatusBadge } from "@/components/status-badge";
import { useChartNow } from "@/hooks/use-now";
import { fmtBps, fmtPct, truncateAddress } from "@/lib/format";
import { useBonds } from "@/lib/live/hooks";
import { accretionHistory, type InvoiceBond, impliedApyPct, tenorDays } from "@/lib/mock";
import { BuyPanel } from "./buy-panel";
import { MarketSection } from "./market-panel";
import { AuditTrail, FundingSection, InvoiceDetailsSection } from "./sections";

export function InvoicePage({ bond }: Readonly<{ bond: InvoiceBond }>) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const [range, setRange] = useState<ChartRange>("ALL");

  const idLabel = bond.live ? truncateAddress(bond.id) : bond.id.toUpperCase();
  const chartNow = useChartNow();
  const points = useMemo(
    () => (chartNow ? accretionHistory(bond, chartNow - RANGE_MS[range], chartNow) : []),
    [bond, range, chartNow],
  );

  const widget = <BuyPanel bond={bond} />;

  return (
    <>
      <Header />
      <main className="container-page pb-24">
        <div className="grid min-h-svh grid-cols-1 gap-x-6 gap-y-10 py-8 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_488px]">
          {/* Left column: title, chart, sections */}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/"
                aria-label="Back to Marketplace"
                className="flex size-9 items-center justify-center rounded-full border border-line text-soft hover:text-ink"
              >
                <X size={16} />
              </Link>
              <CompanyAvatar name={bond.issuer} className="size-7 text-[9px]" />
              <h1 className="text-lg font-medium">
                {bond.issuer} <span className="font-normal text-soft">{idLabel}</span>
              </h1>
              <div className="ml-auto">
                <StatusBadge status={bond.status} />
              </div>
            </div>

            <div className="mt-6">
              <div className="tabular text-4xl font-medium tracking-tight">
                {fmtPct(impliedApyPct(bond))}
              </div>
              <div className="mt-1.5 text-[13px] text-soft">
                implied APY · {fmtBps(bond.discountBps)} discount over {tenorDays(bond)} days
              </div>
            </div>

            {/* Zero-coupon carrying value: issue price accreting to face. */}
            <div className="mt-5">
              <div className="mb-3 flex justify-end">
                <RangeTabs value={range} onChange={setRange} className="inline-flex" />
              </div>
              <PriceChart points={points} trend="up" range={range} />
            </div>

            <FundingSection bond={bond} />
            <MarketSection bond={bond} />
            <InvoiceDetailsSection bond={bond} />
            <AuditTrail bond={bond} />
          </div>

          {/* Right column: buy panel (large screens only) */}
          <div className="hidden lg:sticky lg:top-24 lg:block lg:self-start">{widget}</div>
        </div>
      </main>

      {/* Below lg the panel lives in a bottom sheet. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white p-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="h-12 w-full rounded-xl bg-ink text-sm font-medium text-white"
        >
          {bond.status === "open" ? "Fund Invoice" : "View Order Panel"}
        </button>
      </div>
      <Sheet
        open={sheetOpen}
        onClose={closeSheet}
        closeLabel="Close order panel"
        className="lg:hidden"
        panelClassName="max-h-[85svh] overflow-y-auto p-3"
      >
        {widget}
      </Sheet>
      <Footer />
      {/* Spacer so the fixed bar never covers the footer. */}
      <div className="h-20 lg:hidden" />
    </>
  );
}

/** Live-mode detail route: resolves a bytes32 invoiceId against the mirror node. */
export function LiveInvoicePage({ id }: Readonly<{ id: string }>) {
  const { data, isLoading, isError } = useBonds();
  const bond = data?.find((b) => b.id.toLowerCase() === id.toLowerCase());

  if (bond) return <InvoicePage bond={bond} />;
  if (!isLoading && !isError) notFound();
  return (
    <>
      <Header />
      <main className="container-page py-32 text-center text-sm text-soft">
        {isError
          ? "Could not reach the Hedera mirror node — refresh to retry."
          : "Loading invoice from the Hedera mirror node…"}
      </main>
      <Footer />
    </>
  );
}
