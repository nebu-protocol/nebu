import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { PortfolioChart } from "@/components/portfolio-chart";
import { getEthUsdSeries, getLpStats } from "@/lib/lpdata";

export const metadata: Metadata = { title: "Portfolio" };

const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;

export default function PortfolioPage() {
  const stats = getLpStats();
  const series = getEthUsdSeries();
  const fundUsd = stats.ethUsd ? stats.totalFundEth * stats.ethUsd : null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Portfolio</h1>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Deployed fund" value={fmtUsd(fundUsd)} sub={`${stats.totalFundEth.toFixed(3)} ETH`} />
          <Stat label="Open positions" value={String(stats.positions)} />
          <Stat
            label="Avg net vs HODL"
            value={stats.avgNet === null ? "—" : `${stats.avgNet >= 0 ? "+" : ""}${stats.avgNet.toFixed(2)}%`}
            sub={stats.positions ? `${stats.winners}/${stats.positions} beat HODL` : undefined}
          />
          <Stat label="ETH price" value={fmtUsd(stats.ethUsd)} />
        </div>

        <PortfolioChart points={series} label="ETH / USD" />

        <p className="mt-3 text-xs text-soft">
          Chart menampilkan harga ETH/USD dari time-series pool on-chain (denominator portfolio).
          PnL posisi vs HODL ada di dashboard. Simulasi — bukan nasihat finansial.
        </p>
      </main>
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line/60 p-4">
      <div className="text-xs text-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-soft">{sub}</div>}
    </div>
  );
}
