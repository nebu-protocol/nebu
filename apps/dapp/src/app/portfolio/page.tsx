import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { PortfolioChart } from "@/components/portfolio-chart";
import { getWalletPnlSeries, getWalletPortfolio, getWalletPositions } from "@/lib/lpdata";
import { getSiweAddress } from "@/server/siwe";
import { turnstileSiteKey } from "@/server/turnstile";
import { getOwnedWallet } from "@/server/wallet-actions";

import { ManagePanel } from "./manage-panel";
import { PortfolioClient } from "./portfolio-client";

export const metadata: Metadata = { title: "Portfolio" };
export const dynamic = "force-dynamic";

const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

export default async function PortfolioPage() {
  const siwe = await getSiweAddress();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Portfolio</h1>
        {siwe ? <ManagedView address={siwe} /> : <PortfolioClient siteKey={turnstileSiteKey()} />}
        <p className="mt-4 text-xs text-soft">
          PnL untuk wallet-mu. Net vs HODL — simulasi, bukan nasihat finansial.
        </p>
      </main>
    </>
  );
}

async function ManagedView({ address }: { address: string }) {
  const [owned, p, series, positions] = [
    await getOwnedWallet(),
    getWalletPortfolio(address),
    getWalletPnlSeries(address),
    getWalletPositions(address),
  ];
  const fundUsd = p.ethUsd ? p.fundEth * p.ethUsd : null;

  return (
    <div className="flex flex-col gap-6">
      <ManagePanel address={address} wallet={owned} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Deployed fund" value={fmtUsd(fundUsd)} sub={`${p.fundEth.toFixed(3)} ETH`} />
        <Stat label="Open positions" value={String(p.positions)} />
        <Stat
          label="Avg net vs HODL"
          value={p.avgNet === null ? "—" : pct(p.avgNet)}
          sub={p.positions ? `${p.winners}/${p.positions} beat HODL` : undefined}
        />
        <Stat label="ETH price" value={fmtUsd(p.ethUsd)} />
      </div>

      <PortfolioChart points={series} label="Portfolio net vs HODL (%)" />

      <div>
        <h3 className="mb-2 text-sm font-medium">Positions</h3>
        <div className="overflow-hidden rounded-xl border border-line/60">
          <table className="w-full text-sm">
            <thead className="bg-shade text-soft">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Pair</th>
                <th className="px-4 py-2 text-right font-medium">Fees</th>
                <th className="px-4 py-2 text-right font-medium">IL</th>
                <th className="px-4 py-2 text-right font-medium">Net vs HODL</th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-soft">
                    Belum ada posisi. Enable automation + fund untuk mulai.
                  </td>
                </tr>
              )}
              {positions.map((pos) => (
                <tr key={pos.pair} className="border-t border-line/60">
                  <td className="px-4 py-2 font-medium">{pos.pair}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">+{pos.fees_pct.toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right text-red-600">{pos.il_pct.toFixed(2)}%</td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${pos.net_pct >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {pct(pos.net_pct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
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
