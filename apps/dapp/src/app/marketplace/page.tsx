import type { Metadata } from "next";

import { AgentCard, type CardMetric } from "@/components/agent-card";
import { Header } from "@/components/layout/header";
import { PoolsExplorer } from "@/components/pools-explorer";
import { AGENTS, type AgentMeta } from "@/lib/agents";
import { getT } from "@/lib/i18n-server";
import { getEstApr, getLeaderboard, getPoolsTable, getTopPools } from "@/lib/lpdata";

export const metadata: Metadata = { title: "Agent Marketplace" };
export const dynamic = "force-dynamic";

// Metrik live flagship (perfSource 'lp') dari DB; agent lain tampil status track-record.
function metricsFor(agent: AgentMeta, live: { apr: number | null; net: number | null; pools: number }): CardMetric[] {
  if (agent.perfSource === "lp") {
    return [
      { label: "Est. APR", value: live.apr != null ? `${live.apr.toFixed(1)}%` : "—", good: true },
      { label: "Net vs HODL", value: live.net != null ? `${live.net >= 0 ? "+" : ""}${live.net.toFixed(2)}%` : "—", good: (live.net ?? 0) >= 0 },
      { label: "Active pools", value: String(live.pools) },
    ];
  }
  return [{ label: "Track record", value: agent.status === "beta" ? "Building — onchain soon" : "Coming soon" }];
}

export default async function MarketplacePage() {
  const t = await getT();

  const apr = getEstApr(3);
  const board = getLeaderboard();
  const net = board.length ? board.reduce((s, r) => s + r.avgNet, 0) / board.length : null;
  const pools = getPoolsTable(30);
  const live = { apr, net, pools: getTopPools(30).length };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Featured agents */}
        <section className="rounded-2xl border border-line/60 bg-shade/30 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-semibold">✦ {t("Agents")}</h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs text-soft ring-1 ring-line/60">{AGENTS.length}</span>
            <p className="text-sm text-soft">{t("Non-custodial · hire and revoke anytime")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {AGENTS.map((a) => (
              <AgentCard key={a.id} agent={a} metrics={metricsFor(a, live)} />
            ))}
          </div>
        </section>

        {/* Opportunities — dense grid of real BNB pools */}
        <section className="mt-8">
          <PoolsExplorer pools={pools} />
        </section>

        <p className="mt-6 text-xs text-faint">
          {t("All pairs are real BNB Chain pools. Agents run on BSC; live performance is read on-chain and reconciles with explorers.")}
        </p>
      </main>
    </>
  );
}
