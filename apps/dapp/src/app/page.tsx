import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { MiniLine } from "@/components/mini-line";
import { Sparkline } from "@/components/sparkline";
import { TokenIcon } from "@/components/token-icon";
import { WelcomeCard } from "@/components/welcome-card";
import { getT } from "@/lib/i18n-server";
import { getPoolsTable } from "@/lib/lpdata";

export const metadata: Metadata = { alternates: { canonical: "/" } };
export const dynamic = "force-dynamic";

const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;
// Persen: separator ribuan + maks 2 desimal.
const fmtPct = (n: number, dp = 2) =>
  n.toLocaleString(undefined, { maximumFractionDigits: dp });
const chg = (n: number | null) =>
  n === null ? <span className="text-soft">—</span> : (
    <span className={n >= 0 ? "text-emerald-600" : "text-red-600"}>
      {n >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(n))}%
    </span>
  );

export default async function Page() {
  const t = await getT();
  const pools = getPoolsTable(30);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* portfolio card (ala Ondo) */}
        <section className="mb-8">
          <WelcomeCard />
        </section>

        {/* top pools cards (ala Ondo asset cards) */}
        {pools.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-lg font-medium">{t("Top pools")}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {pools.slice(0, 4).map((p) => (
                <div key={p.poolId} className="overflow-hidden rounded-2xl border border-line/60 p-4">
                  <div className="flex items-center gap-2">
                    <TokenIcon symbol={p.sym1} address={p.address} size={32} link />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{p.sym1}</div>
                      <div className="text-xs text-soft">/ ETH</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-2xl font-semibold tracking-tight">{fmtPct(p.apr20, 0)}%</span>
                    <span className="text-xs text-soft">{t("APR")}</span>
                  </div>
                  <div className="text-xs">{chg(p.changePct)}</div>
                  <div className="mt-3 h-14">
                    <Sparkline values={p.spark} trend={(p.changePct ?? 0) >= 0 ? "up" : "down"} animate={false} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* pools table */}
        <section>
          <h2 className="mb-3 text-lg font-medium">{t("Pools")}</h2>
          <div className="overflow-x-auto rounded-2xl border border-line/60">
            <table className="w-full text-sm">
              <thead className="border-line/60 border-b text-soft">
                <tr>
                  <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">#</th>
                  <th className="px-4 py-3 text-left font-medium">{t("Pool")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("APR ±20%")}</th>
                  <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">{t("Δ recent")}</th>
                  <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">Fee/ETH/d</th>
                  <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Vol (ETH)</th>
                  <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">{t("Swaps/h")}</th>
                  <th className="hidden px-4 py-3 text-right font-medium md:table-cell">{t("Trend")}</th>
                </tr>
              </thead>
              <tbody>
                {pools.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-soft">
                      {t("Belum ada data — collector sedang mengumpulkan.")}
                    </td>
                  </tr>
                )}
                {pools.map((p, i) => (
                  <tr key={p.poolId} className="border-line/60 border-t">
                    <td className="hidden px-4 py-3 text-soft sm:table-cell">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <TokenIcon symbol={p.sym1} address={p.address} size={28} link />
                        <span className="font-medium">{p.sym1}</span>
                        <span className="text-xs text-soft">/ {p.sym0}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium">{fmtPct(p.apr20, 0)}%</td>
                    <td className="hidden whitespace-nowrap px-4 py-3 text-right sm:table-cell">{chg(p.changePct)}</td>
                    <td className="hidden px-4 py-3 text-right lg:table-cell">{p.feePerEthDay.toFixed(5)}</td>
                    <td className="hidden px-4 py-3 text-right md:table-cell">{p.volEth?.toFixed(1) ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-right lg:table-cell">{p.swapsPerH.toFixed(0)}</td>
                    <td className="hidden px-4 py-3 md:table-cell">
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
            {t("APR gross (pre-IL). Δ dari time-series harga on-chain. Bukan nasihat finansial.")}
          </p>
        </section>
      </main>
    </>
  );
}
