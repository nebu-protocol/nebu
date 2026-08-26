import type { Metadata } from "next";

import { GeneratedAvatar } from "@/components/generated-avatar";
import { Header } from "@/components/layout/header";
import { PortfolioChart } from "@/components/portfolio-chart";
import { TokenIcon } from "@/components/token-icon";
import {
  getBalanceEth,
  getBotStatus,
  getEstApr,
  getWalletActivity,
  getWalletDeployed,
  getWalletChartSeries,
  getWalletPortfolio,
  getWalletRealPnl,
  getWalletRealPositions,
} from "@/lib/lpdata";
import { SubmitButton } from "@/components/submit-button";
import { getSiweAddress } from "@/server/siwe";
import { closePositionAction, getOwnedWallet } from "@/server/wallet-actions";

import { ActivityTable } from "./activity-table";
import { ManagePanel } from "./manage-panel";
import { MobileManage } from "./mobile-manage";
import { PortfolioClient } from "./portfolio-client";

export const metadata: Metadata = { title: "Portfolio" };
export const dynamic = "force-dynamic";

const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
/** Desimal ETH menyesuaikan besar saldo — saldo kecil butuh lebih banyak angka. */
const fmtEth = (n: number) => {
  const a = Math.abs(n);
  const dp = a === 0 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : a >= 0.0001 ? 6 : 8;
  return n.toFixed(dp);
};

/** Angka $ besar dgn desimal abu-abu (ala Ondo). */
function BigUsd({ n }: { n: number | null }) {
  if (n === null) return <span className="text-4xl font-semibold tracking-tight">—</span>;
  const [int, dec] = n
    .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(".");
  return (
    <span className="text-4xl font-semibold tracking-tight sm:text-5xl">
      ${int}
      <span className="text-soft">.{dec}</span>
    </span>
  );
}

export default async function PortfolioPage() {
  const siwe = await getSiweAddress();

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Portfolio</h1>
        {siwe ? <ManagedView address={siwe} /> : <PortfolioClient />}
        <p className="mt-4 text-xs text-soft">
          PnL untuk wallet-mu. Net vs HODL — simulasi, bukan nasihat finansial.
        </p>
      </main>
    </>
  );
}

async function ManagedView({ address }: { address: string }) {
  const owned = await getOwnedWallet();
  // Semua read/write ke AGENT wallet, bukan address SIWE. Belum ada agent => panel create.
  const agent = owned?.address ?? null;
  // Dua saldo beda: agent (untuk withdraw/deploy) & owner/wallet user (sumber deposit).
  const [balanceEth, ownerBalanceEth] = await Promise.all([
    agent ? getBalanceEth(agent) : Promise.resolve(null),
    getBalanceEth(address),
  ]);
  const p = getWalletPortfolio(agent ?? address);
  // Seri chart kanonik (sinkron dgn WelcomeCard di Overview).
  const chart = agent ? getWalletChartSeries(agent) : { points: [], isReal: false };
  const series = chart.points;
  const seriesIsReal = chart.isReal;
  const positions = agent ? getWalletRealPositions(agent) : [];
  const activity = agent ? getWalletActivity(agent) : [];
  const realPnl = agent ? getWalletRealPnl(agent) : null;
  const hasReal = !!realPnl && realPnl.ts !== null; // ada PnL (open/closed) yg sudah dihitung
  // Deployed fund + PnL: pakai on-chain NYATA kalau sudah dihitung, else fallback executions/model.
  const deployedEth = hasReal ? realPnl!.deployedEth : agent ? getWalletDeployed(agent) : 0;
  const deployedUsd = p.ethUsd ? deployedEth * p.ethUsd : null;
  const avgNet = hasReal ? realPnl!.avgNetPct : p.avgNet;
  const pnlEth = hasReal ? realPnl!.pnlEth : null;
  const pnlUsd = p.ethUsd && pnlEth !== null ? pnlEth * p.ethUsd : null;
  const botStatus = agent ? getBotStatus(agent) : null;
  const liveMode = process.env.EXECUTOR_LIVE === "1";
  const estApr = getEstApr();
  // Total nilai = saldo idle agent + nilai posisi OPEN (on-chain).
  const totalEth = (balanceEth ?? 0) + (realPnl?.valueEth ?? 0);
  const totalUsd = p.ethUsd ? totalEth * p.ethUsd : null;
  const timeAgo = (ts: number) => {
    const s = Math.floor(Date.now() / 1000) - ts;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-3 lg:items-start">
      <div className="order-2 flex min-w-0 flex-col gap-6 lg:order-1 lg:col-span-2">
        <div className="rounded-2xl border border-line/60 p-5">
          <div className="flex items-center gap-3">
            <GeneratedAvatar name={address} size={40} />
            <h2 className="text-lg font-medium">
              Welcome,{" "}
              <span className="font-mono">
                {address.slice(0, 6)}…{address.slice(-4)}
              </span>
            </h2>
          </div>
          <div className="mt-4 text-sm text-soft">Total value</div>
          <BigUsd n={totalUsd} />
          <div className="mt-1 text-xs text-soft">
            {fmtEth(totalEth)} ETH · idle + {realPnl?.positions ?? 0} posisi
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-line/60 pt-4 sm:grid-cols-4">
            <Metric label="Deployed" value={deployedUsd === null ? `${fmtEth(deployedEth)} ETH` : fmtUsd(deployedUsd)} />
            <Metric label="Open positions" value={String(realPnl?.positions ?? 0)} />
            <Metric label="Net vs HODL" value={avgNet === null ? "—" : pct(avgNet)} tone={avgNet} />
            <Metric
              label="Your PnL"
              value={
                hasReal
                  ? pnlUsd === null
                    ? `${pnlEth! >= 0 ? "+" : ""}${fmtEth(pnlEth!)} ETH`
                    : `${pnlEth! >= 0 ? "+" : ""}${fmtUsd(pnlUsd)}`
                  : "—"
              }
              tone={hasReal ? pnlEth : null}
            />
          </div>
        </div>

        {agent && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-line/60 px-4 py-2.5 text-sm">
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${liveMode ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
            >
              {liveMode ? "LIVE" : "SIMULASI"}
            </span>
            <span className="font-medium">Bot {owned?.automation ? "aktif" : "nonaktif"}</span>
            <span className="text-soft">
              {botStatus?.lastRunTs ? `· run ${timeAgo(botStatus.lastRunTs)}` : "· belum jalan"}
            </span>
            {botStatus?.lastRunTs && botStatus.live > 0 ? (
              <span className="text-soft">· {botStatus.live} aksi on-chain</span>
            ) : null}
          </div>
        )}

      <PortfolioChart
        points={series}
        headerValue={totalUsd}
        label={`Total value · net vs HODL ${seriesIsReal ? "(on-chain)" : "(sim)"}`}
      />

      <div>
        <h3 className="mb-1 text-sm font-medium">Your positions</h3>
        <p className="mb-2 text-xs text-soft">
          On-chain nyata · Net vs HODL = nilai posisi sekarang vs ETH awal.
        </p>
        <div className="overflow-x-auto rounded-xl border border-line/60">
          <table className="w-full min-w-[440px] whitespace-nowrap text-sm">
            <thead className="border-b border-line/60 text-soft">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Pair</th>
                <th className="px-4 py-3 text-right font-medium">Fees</th>
                <th className="px-4 py-3 text-right font-medium">Net vs HODL</th>
                <th className="px-4 py-3 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-soft">
                    Belum ada posisi. Aktifkan automation + fund untuk mulai.
                  </td>
                </tr>
              )}
              {positions.map((pos, i) => (
                <tr key={`${pos.pair}-${i}`} className="border-t border-line/60 hover:bg-shade/40">
                  <td className="px-4 py-3 font-medium">
                    <span
                      className="flex items-center gap-2 whitespace-nowrap"
                      title={`Range [${pos.tickLower}, ${pos.tickUpper}] · IL ${pos.ilPct === null ? "—" : pos.ilPct.toFixed(2) + "%"}`}
                    >
                      <TokenIcon symbol={pos.pair.split("/")[1] ?? pos.pair} address={pos.tokenAddr} size={22} />
                      {pos.pair}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-600">
                    {pos.feesPct === null ? "—" : `+${pos.feesPct.toFixed(2)}%`}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-medium ${(pos.netPct ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {pos.netPct === null ? "—" : pct(pos.netPct)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={closePositionAction}>
                      <input type="hidden" name="poolId" value={pos.poolId} />
                      <SubmitButton
                        pendingText="Menutup…"
                        className="rounded-lg border border-line/60 px-2.5 py-1 text-xs hover:bg-shade disabled:opacity-60"
                      >
                        Close LP
                      </SubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ActivityTable rows={activity} ethUsd={p.ethUsd} />
      </div>

      <div className="order-1 min-w-0 lg:order-2 lg:sticky lg:top-20 lg:self-start">
        {/* desktop: panel inline; mobile: tombol → dialog */}
        <div className="hidden lg:block">
          <ManagePanel
            owner={address}
            agent={agent}
            wallet={owned}
            balanceEth={balanceEth}
            ownerBalanceEth={ownerBalanceEth}
            ethUsd={p.ethUsd}
            estApr={estApr}
          />
        </div>
        <MobileManage
          owner={address}
          agent={agent}
          wallet={owned}
          balanceEth={balanceEth}
          ownerBalanceEth={ownerBalanceEth}
          ethUsd={p.ethUsd}
          estApr={estApr}
        />
      </div>
    </div>
  );
}

/** Metrik ringkas (label + value), warna dari tanda `tone` (angka) kalau ada. */
function Metric({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  const c = tone == null ? "" : tone >= 0 ? "text-emerald-600" : "text-red-600";
  return (
    <div>
      <div className="text-xs text-soft">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${c}`}>{value}</div>
    </div>
  );
}
