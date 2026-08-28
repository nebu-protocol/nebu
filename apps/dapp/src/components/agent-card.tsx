import Link from "next/link";

import type { AgentCategory, AgentMeta, AgentStatus } from "@/lib/agents";
import { STATUS_LABEL } from "@/lib/agents";

const STATUS_STYLE: Record<AgentStatus, string> = {
  live: "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20",
  beta: "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20",
  soon: "bg-shade text-faint ring-1 ring-line/60",
};

const CAT_LABEL: Record<AgentCategory, string> = {
  rebalancing: "Rebalancing",
  grid: "Grid trading",
  yield: "Yield",
  health: "Health factor",
};

export interface CardMetric {
  label: string;
  value: string;
  good?: boolean;
}

/** Kartu agent (gaya OpenSea): ikon kiri + nama/subtitle, chevron, deskripsi, tag badge. */
export function AgentCard({ agent, metrics }: { agent: AgentMeta; metrics: CardMetric[] }) {
  return (
    <Link
      href={`/marketplace/${agent.id}`}
      className="group flex flex-col rounded-2xl border border-line/60 bg-white p-4 transition hover:-translate-y-0.5 hover:border-line hover:shadow-lg"
    >
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={agent.image} alt={agent.name} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-ink">{agent.name}</div>
          <div className="truncate text-xs text-soft">{CAT_LABEL[agent.category]} · BNB Chain</div>
        </div>
        <svg
          className="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-ink"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 6 6 6-6 6" />
        </svg>
      </div>

      <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-soft">{agent.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[agent.status]}`}>
          {agent.status === "live" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />}
          {STATUS_LABEL[agent.status]}
        </span>
        {metrics.map((m) => (
          <span key={m.label} className="inline-flex items-center gap-1 rounded-full bg-shade px-2.5 py-1 text-xs ring-1 ring-line/60">
            <span className="text-faint">{m.label}</span>
            <span className={`font-semibold ${m.good === undefined ? "text-ink" : m.good ? "text-emerald-600" : "text-red-600"}`}>{m.value}</span>
          </span>
        ))}
      </div>
    </Link>
  );
}
