import type { Metadata } from "next";
import Link from "next/link";

import { type CardMetric } from "@/components/agent-card";
import { AgentsExplorer, type AgentItem } from "@/components/agents-explorer";
import { Header } from "@/components/layout/header";
import { WelcomeCard } from "@/components/welcome-card";
import { AGENTS, type AgentMeta } from "@/lib/agents";
import { getT } from "@/lib/i18n-server";
import { getEstApr, getLeaderboard, getTopPools } from "@/lib/lpdata";
import { getSiweAddress } from "@/server/siwe";

export const metadata: Metadata = { alternates: { canonical: "/" } };
export const dynamic = "force-dynamic";

type Live = { apr: number | null; net: number | null; pools: number; bestApr: number | null };

function metricsFor(agent: AgentMeta, live: Live): CardMetric[] {
  const pct = (n: number | null) => (n != null ? `${n.toFixed(1)}%` : "—");
  switch (agent.category) {
    case "rebalancing":
      return [
        { label: "Est. APR", value: pct(live.apr), good: true },
        { label: "Net vs HODL", value: live.net != null ? `${live.net >= 0 ? "+" : ""}${live.net.toFixed(2)}%` : "—", good: (live.net ?? 0) >= 0 },
        { label: "Pools", value: String(live.pools) },
      ];
    case "yield":
      return [
        { label: "Best APR", value: pct(live.bestApr), good: true },
        { label: "Auto-compound", value: "Daily" },
        { label: "Venues", value: String(live.pools) },
      ];
    case "grid":
      return [
        { label: "Markets", value: String(live.pools) },
        { label: "Strategy", value: "Buy-low / sell-high" },
      ];
    case "health":
      return [
        { label: "Protects", value: "Venus loans" },
        { label: "Watch", value: "24/7" },
      ];
  }
}

export default async function Page() {
  const t = await getT();
  const siwe = await getSiweAddress();

  const apr = getEstApr(3);
  const board = getLeaderboard();
  const net = board.length ? board.reduce((s, r) => s + r.avgNet, 0) / board.length : null;
  const top = getTopPools(30);
  const bestApr = top.length ? Math.max(...top.map((p) => p.apr20)) : null;
  const live: Live = { apr, net, pools: top.length, bestApr };
  const items: AgentItem[] = AGENTS.map((a) => ({ agent: a, metrics: metricsFor(a, live) }));

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {siwe ? (
          // Connected → portfolio card di paling atas.
          <section className="mb-8">
            <WelcomeCard />
          </section>
        ) : (
          // Belum connect → hero pitch.
          <section className="relative mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-700 to-slate-900 px-6 py-14 text-center text-white sm:py-20">
            <div
              className="pointer-events-none absolute inset-0 opacity-40"
              style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)", backgroundSize: "26px 26px" }}
            />
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-fuchsia-500/30 blur-3xl" />
            <div className="relative">
              <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{t("Hire onchain agents")}</h1>
              <p className="mx-auto mt-4 max-w-xl text-white/80">
                {t("Put your capital to work in a vault they can't withdraw from — pay only when they perform.")}
              </p>
              <Link
                href="/portfolio"
                className="mt-7 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
              >
                {t("Connect wallet")}
              </Link>
            </div>
          </section>
        )}

        {/* List market agent */}
        <AgentsExplorer items={items} />
      </main>
    </>
  );
}
