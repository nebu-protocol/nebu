"use client";

import { type ChartRange, RANGE_MS } from "@/components/charts/price-chart";
import { useWallet } from "@/features/wallet/wallet-provider";
import { CHART_POINTS, type HoldingInput, portfolioSeries, type SeriesPoint } from "@/lib/charts";
import { DEMO_DATA } from "@/lib/live/chain";
import { type LivePosition, usePortfolio } from "@/lib/live/hooks";
import { getBond, HOLDINGS, type InvoiceBond } from "@/lib/mock";

export type Row = {
  bond: InvoiceBond;
  faceUsdc: number;
  costUsdc: number;
  claimableUsdc: number;
  acquiredDate?: string;
};

/** Demo positions: mock holdings resolved against the fixture bonds. */
function demoRows(): Row[] {
  return HOLDINGS.flatMap((h) => {
    const bond = getBond(h.bondId);
    if (!bond) return [];
    return [
      {
        bond,
        faceUsdc: h.faceUsdc,
        costUsdc: h.costUsdc,
        claimableUsdc: bond.status === "matured" ? h.faceUsdc : 0,
        acquiredDate: h.acquiredDate,
      },
    ];
  });
}

/**
 * Portfolio value curve over the selected range: Σ holdings of the accreted
 * position value, each contributing 0 before its purchase timestamp. The ALL
 * range starts at the wallet's earliest purchase.
 */
export function portfolioValueSeries(
  rows: Row[],
  range: ChartRange,
  now: number,
  n = CHART_POINTS,
): SeriesPoint[] {
  if (now === 0) return [];
  const holdings: HoldingInput[] = rows.map((r) => {
    const listMs = Date.parse(r.bond.issueDate);
    return {
      costUsdc: r.costUsdc,
      faceUsdc: r.faceUsdc,
      purchaseMs: r.acquiredDate ? Date.parse(r.acquiredDate) : listMs,
      listMs,
      maturityMs: Date.parse(r.bond.maturityDate),
    };
  });
  const earliest = holdings.length
    ? Math.min(...holdings.map((h) => h.purchaseMs))
    : now - RANGE_MS["1D"];
  // min() keeps the window non-degenerate when the first purchase is seconds old.
  const from = Math.min(range === "ALL" ? earliest : now - RANGE_MS[range], now - 60_000);
  return portfolioSeries(holdings, from, now, n);
}

function liveRows(positions: LivePosition[]): Row[] {
  return positions.map((p) => ({
    bond: p.bond,
    faceUsdc: p.faceUsdc,
    costUsdc: p.costUsdc,
    claimableUsdc: p.claimableUsdc,
    acquiredDate: p.acquiredDate,
  }));
}

/** The connected wallet's bond positions, shared by /portfolio and the explore banner. */
export function usePortfolioRows() {
  const { address, booting } = useWallet();
  const portfolio = usePortfolio(address);

  const loading = booting || (!DEMO_DATA && Boolean(address) && portfolio.isLoading);
  const rows: Row[] = DEMO_DATA ? demoRows() : liveRows(portfolio.data ?? []);
  const positionsById = new Map((portfolio.data ?? []).map((p) => [p.bond.id, p]));

  return {
    address,
    booting,
    loading,
    isError: !DEMO_DATA && portfolio.isError,
    rows,
    positionsById,
  };
}
