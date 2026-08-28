import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HirePanel } from "@/components/hire-panel";
import { Header } from "@/components/layout/header";
import { getAgent, STATUS_LABEL } from "@/lib/agents";
import { getT } from "@/lib/i18n-server";
import { getEstApr, getLeaderboard, getTopPools } from "@/lib/lpdata";
import { getActiveHire } from "@/server/hire-actions";
import { getSiweAddress } from "@/server/siwe";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const a = getAgent(id);
  return { title: a ? `${a.name} — Agent` : "Agent" };
}

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) notFound();
  const t = await getT();

  const isLive = agent.perfSource === "lp";
  const authed = !!(await getSiweAddress());
  const active = isLive ? await getActiveHire(agent.id) : null;
  const apr = isLive ? getEstApr(3) : null;
  const board = isLive ? getLeaderboard() : [];
  const net = board.length ? board.reduce((s, r) => s + r.avgNet, 0) / board.length : null;
  const pools = isLive ? getTopPools(8).length : 0;

  const stats: { label: string; value: string }[] = isLive
    ? [
        { label: t("Est. fee APR"), value: apr != null ? `${apr.toFixed(1)}%` : "—" },
        { label: t("Avg net vs HODL"), value: net != null ? `${net >= 0 ? "+" : ""}${net.toFixed(2)}%` : "—" },
        { label: t("Active pools"), value: String(pools) },
        { label: t("Chain"), value: "BNB Smart Chain" },
      ]
    : [];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/marketplace" className="text-sm text-soft hover:text-ink">
          ← {t("All agents")}
        </Link>

        <div className="mt-4 flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agent.image} alt={agent.name} className="h-16 w-16 rounded-2xl object-cover" />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{agent.name}</h1>
              <span className="rounded-full bg-shade px-2.5 py-1 text-xs font-medium text-soft ring-1 ring-line/60">
                {STATUS_LABEL[agent.status]}
              </span>
            </div>
            <p className="mt-1 text-soft">{agent.tagline}</p>
          </div>
        </div>

        <p className="mt-6 leading-relaxed text-ink/90">{agent.description}</p>

        {stats.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl border border-line/60 p-3">
                <div className="text-[11px] uppercase tracking-wide text-faint">{s.label}</div>
                <div className="mt-0.5 text-lg font-semibold">{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Inti non-custodial: apa yang di-grant saat hire */}
        <div className="mt-8 rounded-2xl border border-line/60 bg-shade/40 p-5">
          <h2 className="flex items-center gap-2 font-semibold">🔒 {t("What you grant when you hire")}</h2>
          <p className="mt-1 text-sm text-soft">
            {t("Hiring grants a scoped, revocable session on your own vault. The agent works — it can never withdraw.")}
          </p>
          <ul className="mt-3 space-y-2">
            {agent.permissions.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 text-emerald-600">✓</span> {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-8">
          {isLive ? (
            <HirePanel agentId={agent.id} authed={authed} active={active} />
          ) : (
            <div className="rounded-2xl border border-line/60 p-5">
              <button disabled className="cursor-not-allowed rounded-xl bg-shade px-5 py-2.5 text-sm font-medium text-faint">
                {agent.status === "beta" ? t("In beta — join waitlist") : t("Coming soon")}
              </button>
              <p className="mt-2 text-xs text-faint">{t("This agent is on the way. Live agents can be hired non-custodially, revocable anytime.")}</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
