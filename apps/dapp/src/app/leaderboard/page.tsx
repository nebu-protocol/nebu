import type { Metadata } from "next";

import { GeneratedAvatar } from "@/components/generated-avatar";
import { Header } from "@/components/layout/header";
import { getLeaderboard, getLpStats } from "@/lib/lpdata";

export const metadata: Metadata = { title: "Leaderboard" };
export const dynamic = "force-dynamic";

const isAddr = (s: string) => /^0x[0-9a-fA-F]{40}$/.test(s);
const name = (owner: string) => (isAddr(owner) ? `${owner.slice(0, 6)}…${owner.slice(-4)}` : owner);
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;
const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : String(i + 1));

export default function LeaderboardPage() {
  const rows = getLeaderboard();
  const ethUsd = getLpStats().ethUsd;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="mb-6 text-sm text-soft">
          Peringkat wallet berdasarkan rata-rata net vs HODL (posisi OPEN, PnL on-chain nyata).
        </p>

        <div className="overflow-x-auto rounded-2xl border border-line/60">
          <table className="w-full min-w-[620px] whitespace-nowrap text-sm">
            <thead className="border-b border-line/60 text-soft">
              <tr>
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Wallet</th>
                <th className="px-4 py-3 text-right font-medium">Avg net vs HODL</th>
                <th className="px-4 py-3 text-right font-medium">PnL</th>
                <th className="px-4 py-3 text-right font-medium">Positions</th>
                <th className="px-4 py-3 text-right font-medium">Deployed</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-soft">
                    Belum ada wallet dengan posisi + PnL. Cek lagi setelah bot deploy & hitung PnL.
                  </td>
                </tr>
              )}
              {rows.map((r, i) => (
                <tr key={r.owner} className="border-t border-line/60 hover:bg-shade/40">
                  <td className="px-4 py-3 text-soft">{medal(i)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <GeneratedAvatar name={r.owner} size={28} />
                      <span className="font-mono font-medium">{name(r.owner)}</span>
                    </span>
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${r.avgNet >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {pct(r.avgNet)}
                  </td>
                  <td className={`px-4 py-3 text-right ${r.pnlEth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {ethUsd ? `${r.pnlEth >= 0 ? "+" : ""}${fmtUsd(r.pnlEth * ethUsd)}` : `${r.pnlEth.toFixed(6)} ETH`}
                  </td>
                  <td className="px-4 py-3 text-right">{r.positions}</td>
                  <td className="px-4 py-3 text-right">
                    {ethUsd ? fmtUsd(r.deployedEth * ethUsd) : `${r.deployedEth.toFixed(6)} ETH`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
