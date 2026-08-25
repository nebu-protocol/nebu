import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { getLpStats, getTopPools } from "@/lib/lpdata";

export const metadata: Metadata = { alternates: { canonical: "/" } };

const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;

export default function Page() {
  const stats = getLpStats();
  const pools = getTopPools(8);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-12">
        <section className="mb-12 max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight">Automated liquidity on Robinhood Chain</h1>
          <p className="mt-3 text-soft">
            Uniswap v4 liquidity provision, automated: survivor-pool selection, concentrated ranges,
            and every position benchmarked against simply holding ETH.
          </p>
          <a
            href="/portfolio"
            className="mt-6 inline-block rounded-lg bg-ink px-4 py-2 font-medium text-white"
          >
            View portfolio →
          </a>
        </section>

        <section className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Active pools" value={stats.activePools.toLocaleString()} />
          <Stat label="Passing guards" value={String(stats.passingGuards)} />
          <Stat
            label="Avg net vs HODL"
            value={stats.avgNet === null ? "—" : `${stats.avgNet >= 0 ? "+" : ""}${stats.avgNet.toFixed(1)}%`}
          />
          <Stat label="ETH price" value={fmtUsd(stats.ethUsd)} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium">Top opportunities</h2>
          <div className="overflow-hidden rounded-xl border border-line/60">
            <table className="w-full text-sm">
              <thead className="bg-shade text-soft">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Pair</th>
                  <th className="px-4 py-2 text-right font-medium">Age (d)</th>
                  <th className="px-4 py-2 text-right font-medium">APR ±20% (gross)</th>
                </tr>
              </thead>
              <tbody>
                {pools.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-soft">
                      Belum ada data — collector sedang mengumpulkan.
                    </td>
                  </tr>
                )}
                {pools.map((p) => (
                  <tr key={p.pair} className="border-t border-line/60">
                    <td className="px-4 py-2 font-medium">{p.pair}</td>
                    <td className="px-4 py-2 text-right">{p.age_days?.toFixed(1) ?? "?"}</td>
                    <td className="px-4 py-2 text-right">{p.apr20.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-soft">APR gross (pre-IL). Bukan nasihat finansial.</p>
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/60 p-4">
      <div className="text-xs text-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
