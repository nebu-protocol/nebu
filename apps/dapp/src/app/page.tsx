import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { MiniLine } from "@/components/mini-line";
import { TokenIcon } from "@/components/token-icon";
import { getLpStats, getPoolsTable } from "@/lib/lpdata";

export const metadata: Metadata = { alternates: { canonical: "/" } };
export const dynamic = "force-dynamic";

const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;
const chg = (n: number | null) =>
  n === null ? <span className="text-soft">—</span> : (
    <span className={n >= 0 ? "text-emerald-600" : "text-red-600"}>
      {n >= 0 ? "▲" : "▼"} {Math.abs(n).toFixed(1)}%
    </span>
  );

export default async function Page() {
  const stats = getLpStats();
  const pools = await getPoolsTable(30);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* summary cards */}
        <section className="mb-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-line/60 p-5">
            <div className="text-2xl font-semibold tracking-tight">{stats.activePools.toLocaleString()}</div>
            <div className="text-sm text-soft">Active pools · Robinhood Chain</div>
          </div>
          <div className="rounded-2xl border border-line/60 p-5">
            <div className="flex items-center gap-2 font-medium">🔥 Top APR (gross)</div>
            <ul className="mt-3 space-y-2 text-sm">
              {pools.slice(0, 3).map((p) => (
                <li key={p.poolId} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <TokenIcon symbol={p.sym1} iconUrl={p.iconUrl} size={20} /> {p.sym1}
                  </span>
                  <span className="font-medium text-emerald-600">{p.apr20.toFixed(0)}%</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line/60 p-5">
            <div className="flex items-center gap-2 font-medium">📈 Avg net vs HODL</div>
            <div className="mt-3 text-2xl font-semibold">
              {stats.avgNet === null ? "—" : `${stats.avgNet >= 0 ? "+" : ""}${stats.avgNet.toFixed(1)}%`}
            </div>
            <div className="text-sm text-soft">
              {stats.positions ? `${stats.winners}/${stats.positions} beat HODL` : "menunggu data"}
            </div>
          </div>
        </section>

        {/* pools table */}
        <section>
          <h2 className="mb-3 text-lg font-medium">Pools</h2>
          <div className="overflow-x-auto rounded-2xl border border-line/60">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-line/60 border-b text-soft">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">#</th>
                  <th className="px-4 py-3 text-left font-medium">Pool</th>
                  <th className="px-4 py-3 text-right font-medium">APR ±20%</th>
                  <th className="px-4 py-3 text-right font-medium">Δ recent</th>
                  <th className="px-4 py-3 text-right font-medium">Fee/ETH/d</th>
                  <th className="px-4 py-3 text-right font-medium">Vol (ETH)</th>
                  <th className="px-4 py-3 text-right font-medium">Swaps/h</th>
                  <th className="px-4 py-3 text-right font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {pools.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-soft">
                      Belum ada data — collector sedang mengumpulkan.
                    </td>
                  </tr>
                )}
                {pools.map((p, i) => (
                  <tr key={p.poolId} className="border-line/60 border-t">
                    <td className="px-4 py-3 text-soft">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={p.sym1} iconUrl={p.iconUrl} size={28} />
                        <span className="font-medium">{p.sym1}</span>
                        <span className="text-xs text-soft">/ {p.sym0}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{p.apr20.toFixed(0)}%</td>
                    <td className="px-4 py-3 text-right">{chg(p.changePct)}</td>
                    <td className="px-4 py-3 text-right">{p.feePerEthDay.toFixed(5)}</td>
                    <td className="px-4 py-3 text-right">{p.volEth?.toFixed(1) ?? "—"}</td>
                    <td className="px-4 py-3 text-right">{p.swapsPerH.toFixed(0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <MiniLine values={p.spark} up={(p.changePct ?? 0) >= 0} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-soft">
            APR gross (pre-IL). Δ dari time-series harga on-chain. Bukan nasihat finansial.
          </p>
        </section>
      </main>
    </>
  );
}
