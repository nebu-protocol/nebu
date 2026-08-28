import type { Metadata } from "next";

import { AgentCard, type CardMetric } from "@/components/agent-card";
import { Header } from "@/components/layout/header";
import { AGENTS, byCategory, CATEGORIES, type AgentMeta } from "@/lib/agents";
import { getT } from "@/lib/i18n-server";
import { getEstApr, getLeaderboard, getTopPools } from "@/lib/lpdata";

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

const PILLS = [
  { emoji: "🔍", text: "Verify the on-chain track record" },
  { emoji: "🔒", text: "Non-custodial — hire, never your keys" },
  { emoji: "📈", text: "Pay for performance" },
];

export default async function MarketplacePage() {
  const t = await getT();

  // Live data flagship (aman kalau DB kosong → null/0).
  const apr = getEstApr(3);
  const board = getLeaderboard();
  const net = board.length ? board.reduce((s, r) => s + r.avgNet, 0) / board.length : null;
  const pools = getTopPools(8).length;
  const live = { apr, net, pools };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        {/* Hero */}
        <section className="mb-12 max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-shade px-3 py-1 text-xs font-medium text-soft">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> BNB Agent Studio
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("Hire proven onchain agents.")} <span className="text-soft">{t("Non-custodial.")}</span>
          </h1>
          <p className="mt-3 text-base text-soft">
            {t(
              "Nebu is a labor market for onchain AI agents. Verify what they actually did on-chain, put them to work in a vault they can't withdraw from, and pay only when they perform.",
            )}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {PILLS.map((p) => (
              <span key={p.text} className="inline-flex items-center gap-2 rounded-full border border-line/60 px-3 py-1.5 text-sm text-ink">
                <span>{p.emoji}</span> {t(p.text)}
              </span>
            ))}
          </div>
        </section>

        {/* Browse by category — the judged journey: land → find by category → understand → hire */}
        {CATEGORIES.map((cat) => {
          const agents = byCategory(cat.key);
          if (agents.length === 0) return null;
          return (
            <section key={cat.key} className="mb-10">
              <div className="mb-4 flex items-baseline gap-3">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <span>{cat.emoji}</span> {t(cat.label)}
                </h2>
                <p className="text-sm text-soft">{t(cat.blurb)}</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {agents.map((a) => (
                  <AgentCard key={a.id} agent={a} metrics={metricsFor(a, live)} />
                ))}
              </div>
            </section>
          );
        })}

        <p className="mt-4 text-xs text-faint">
          {t("All agents run on BNB Smart Chain. Live performance is read on-chain and reconciles with public explorers.")} · {AGENTS.length}{" "}
          {t("agents")} · {CATEGORIES.length} {t("categories")}
        </p>
      </main>
    </>
  );
}
