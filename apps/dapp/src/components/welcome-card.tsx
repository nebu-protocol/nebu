import Link from "next/link";

import { GeneratedAvatar } from "@/components/generated-avatar";
import { Sparkline } from "@/components/sparkline";
import { getBalanceEth, getLpStats, getWalletChartSeries, getWalletRealPnl } from "@/lib/lpdata";
import { getSiweAddress } from "@/server/siwe";
import { getOwnedWallet } from "@/server/wallet-actions";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${n.toFixed(2)}`;
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

/** Angka $ besar dgn desimal abu-abu (ala Ondo). */
function BigUsd({ n }: { n: number | null }) {
  if (n === null) return <span className="text-4xl font-semibold tracking-tight sm:text-5xl">$—</span>;
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

/** Kartu portfolio ala Ondo: Welcome + Total value + chart. Server component. */
export async function WelcomeCard() {
  const siwe = await getSiweAddress();
  const ethUsd = getLpStats().ethUsd;

  if (!siwe) {
    return (
      <div className="rounded-2xl border border-line/60 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Portfolio kamu</h2>
          <Link href="/portfolio" className="text-sm text-soft hover:text-ink">
            Connect wallet →
          </Link>
        </div>
        <div className="mt-4 text-sm text-soft">Total Portfolio Value</div>
        <BigUsd n={null} />
        <p className="mt-1 text-xs text-soft">Connect wallet di Portfolio untuk melihat nilai posisimu.</p>
      </div>
    );
  }

  const owned = await getOwnedWallet();
  const agent = owned?.address ?? null;
  const balanceEth = agent ? await getBalanceEth(agent) : 0;
  const realPnl = agent ? getWalletRealPnl(agent) : null;
  const totalEth = (balanceEth ?? 0) + (realPnl?.valueEth ?? 0);
  const totalUsd = ethUsd ? totalEth * ethUsd : null;
  const pnlEth = realPnl?.pnlEth ?? 0;
  const pnlUsd = ethUsd ? pnlEth * ethUsd : null;
  const netPct = realPnl?.avgNetPct ?? 0;
  // Seri chart kanonik (SINKRON dgn chart di halaman Portfolio).
  const chart = agent ? getWalletChartSeries(agent) : { points: [], isReal: false };
  const values = chart.points.length >= 2 ? chart.points.map((s) => s.value) : [0, 0.0001];
  const up = pnlEth >= 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line/60 p-5">
      <div className="relative z-10 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <GeneratedAvatar name={siwe} size={40} />
          <h2 className="text-lg font-medium">
            Welcome, <span className="font-mono">{short(siwe)}</span>
          </h2>
        </div>
        <Link href="/portfolio" className="whitespace-nowrap text-sm text-soft hover:text-ink">
          View Full Portfolio →
        </Link>
      </div>
      <div className="relative z-10 mt-4 text-sm text-soft">Total Portfolio Value</div>
      <div className="relative z-10">
        <BigUsd n={totalUsd} />
      </div>
      <div className="relative z-10 mt-1 text-sm text-soft">
        {pnlUsd !== null && (
          <span className={up ? "text-emerald-600" : "text-red-600"}>
            {fmtUsd(pnlUsd)} ({fmtPct(netPct)})
          </span>
        )}{" "}
        net vs HODL
      </div>
      {/* chart kanan-bawah */}
      <div className="pointer-events-none absolute bottom-0 right-0 h-24 w-3/5 opacity-90">
        <Sparkline values={values} trend={up ? "up" : "down"} animate={false} />
      </div>
    </div>
  );
}
