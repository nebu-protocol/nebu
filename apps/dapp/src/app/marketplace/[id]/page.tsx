import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HirePanel } from "@/components/hire-panel";
import { Header } from "@/components/layout/header";
import { type AgentCategory, getAgent, STATUS_LABEL } from "@/lib/agents";
import { getT } from "@/lib/i18n-server";
import { getEstApr, getLeaderboard, getTopPools } from "@/lib/lpdata";
import { getActiveHire } from "@/server/hire-actions";
import { getSiweAddress } from "@/server/siwe";

export const dynamic = "force-dynamic";

const CAT_LABEL: Record<AgentCategory, string> = {
  rebalancing: "Rebalancing",
  grid: "Grid trading",
  yield: "Yield",
  health: "Health factor",
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const a = getAgent(id);
  return { title: a ? `${a.name} — Agent` : "Agent" };
}

/** Header seksi (judul + kotak konten) ala OpenSea details. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xl font-semibold tracking-tight">{title}</h2>
      <div className="rounded-2xl border border-line/60 p-5">{children}</div>
    </section>
  );
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) notFound();
  const t = await getT();

  const isLive = agent.status === "live";
  const authed = !!(await getSiweAddress());
  const active = isLive ? await getActiveHire(agent.id) : null;

  const apr = getEstApr(3);
  const board = getLeaderboard();
  const net = board.length ? board.reduce((s, r) => s + r.avgNet, 0) / board.length : null;
  const top = getTopPools(30);
  const pools = top.length;
  const bestApr = top.length ? Math.max(...top.map((p) => p.apr20)) : null;
  const pct = (n: number | null) => (n != null ? `${n.toFixed(1)}%` : "—");
  const netStr = net != null ? `${net >= 0 ? "+" : ""}${net.toFixed(2)}%` : "—";

  const STATS: Record<AgentCategory, [string, string][]> = {
    rebalancing: [["Est. fee APR", pct(apr)], ["Net vs HODL", netStr], ["Active pools", String(pools)], ["Chain", "BNB Smart Chain"]],
    yield: [["Best APR", pct(bestApr)], ["Auto-compound", "Daily"], ["Venues", String(pools)], ["Chain", "BNB Smart Chain"]],
    grid: [["Markets", String(pools)], ["Strategy", "Buy-low / sell-high"], ["Rebalance", "Auto"], ["Chain", "BNB Smart Chain"]],
    health: [["Protects", "Venus loans"], ["Trigger", "Below your HF"], ["Watch", "24/7"], ["Chain", "BNB Smart Chain"]],
  };
  const stats = STATS[agent.category];
  const details: [string, string][] = [
    ["Agent ID", agent.id],
    ["Category", CAT_LABEL[agent.category]],
    ["Status", STATUS_LABEL[agent.status]],
    ["Custody", "Non-custodial · LpVault"],
    ["Registry", "BNB Agent Studio"],
    ["Chain", "BNB Smart Chain (56)"],
  ];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/marketplace" className="inline-flex items-center gap-1 text-sm text-soft hover:text-ink">
          ← {t("Agents")}
        </Link>

        {/* Header */}
        <div className="mt-4 flex items-center gap-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agent.image} alt={agent.name} className="h-20 w-20 shrink-0 rounded-2xl object-cover" />
          <div className="min-w-0">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{agent.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-md bg-shade px-2 py-1 font-medium uppercase tracking-wide text-soft ring-1 ring-line/60">
                {CAT_LABEL[agent.category]}
              </span>
              <span className="rounded-md bg-shade px-2 py-1 font-medium uppercase tracking-wide text-soft ring-1 ring-line/60">
                BNB Chain
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium uppercase tracking-wide ${
                  agent.status === "live"
                    ? "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20"
                    : agent.status === "beta"
                      ? "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20"
                      : "bg-shade text-faint ring-1 ring-line/60"
                }`}
              >
                {agent.status === "live" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
                {STATUS_LABEL[agent.status]}
              </span>
            </div>
          </div>
        </div>

        {/* Two-column body */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Left: hire + description */}
          <div className="space-y-6 lg:col-span-1">
            {isLive ? (
              <HirePanel agentId={agent.id} authed={authed} active={active} />
            ) : (
              <div className="rounded-2xl border border-line/60 p-5">
                <div className="font-medium">{agent.status === "beta" ? t("In beta") : t("Coming soon")}</div>
                <p className="mt-1 text-sm text-soft">
                  {t("This agent is on the way. Live agents can be hired non-custodially, revocable anytime.")}
                </p>
                <button disabled className="mt-3 cursor-not-allowed rounded-xl bg-shade px-5 py-2.5 text-sm font-medium text-faint">
                  {agent.status === "beta" ? t("Join waitlist") : t("Notify me")}
                </button>
              </div>
            )}
            <p className="text-sm leading-relaxed text-soft">{agent.description}</p>
          </div>

          {/* Right: performance, permissions, details, activity */}
          <div className="space-y-8 lg:col-span-2">
            <Section title={t("Performance")}>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {stats.map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[11px] uppercase tracking-wide text-faint">{k}</div>
                    <div className="mt-0.5 text-lg font-semibold">{v}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title={t("What you grant when you hire")}>
              <p className="text-sm text-soft">
                {t("Hiring grants a scoped, revocable session on your own vault. The agent works — it can never withdraw.")}
              </p>
              <ul className="mt-3 space-y-2">
                {agent.permissions.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 text-emerald-600">✓</span> {p}
                  </li>
                ))}
              </ul>
            </Section>

            <Section title={t("Details")}>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                {details.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-4 border-b border-line/40 pb-2 text-sm sm:border-0 sm:pb-0">
                    <dt className="text-soft">{k}</dt>
                    <dd className="font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>

            <Section title={t("Recent activity")}>
              <p className="py-8 text-center text-sm text-soft">
                {t("No activity yet. Activity will appear here as the agent works.")}
              </p>
            </Section>
          </div>
        </div>
      </main>
    </>
  );
}
