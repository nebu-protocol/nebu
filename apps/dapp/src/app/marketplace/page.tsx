import type { Metadata } from "next";
import Link from "next/link";

import { type CardMetric } from "@/components/agent-card";
import { AgentsExplorer, type AgentItem } from "@/components/agents-explorer";
import { Header } from "@/components/layout/header";
import { PoolsExplorer } from "@/components/pools-explorer";
import { AGENTS, type AgentMeta } from "@/lib/agents";
import { getT } from "@/lib/i18n-server";
import { getEstApr, getLeaderboard, getPoolsTable, getTopPools } from "@/lib/lpdata";

export const metadata: Metadata = { title: "Agent Marketplace" };
export const dynamic = "force-dynamic";

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
  const items: AgentItem[] = AGENTS.map((a) => ({ agent: a, metrics: metricsFor(a, live) }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Hero banner */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-700 to-slate-900 px-6 py-16 text-center text-white sm:py-24">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)",
              backgroundSize: "26px 26px",
            }}
          />
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="relative">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">{t("Hire onchain agents")}</h1>
            <p className="mx-auto mt-4 max-w-xl text-base text-white/80 sm:text-lg">
              {t("Put your capital to work in a vault they can't withdraw from — pay only when they perform.")}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a href="#agents" className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:opacity-90">
                {t("Browse agents")}
              </a>
              <Link
                href="/portfolio"
                className="rounded-full bg-white/10 px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/20"
              >
                {t("Connect wallet")}
              </Link>
            </div>
          </div>
        </section>

        {/* Agents — filter + grid */}
        <div className="mt-8">
          <AgentsExplorer items={items} />
        </div>

        {/* Opportunities — real BNB pools table */}
        <div className="mt-10">
          <PoolsExplorer pools={pools} />
        </div>

        <p className="mt-6 text-xs text-faint">
          {t("All agents run on BNB Smart Chain; pools are real PancakeSwap pairs. Live performance reconciles with explorers.")}
        </p>
      </main>
    </>
  );
}
