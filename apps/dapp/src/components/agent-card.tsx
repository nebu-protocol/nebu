import Link from "next/link";

import type { AgentMeta, AgentStatus } from "@/lib/agents";
import { STATUS_LABEL } from "@/lib/agents";

const STATUS_STYLE: Record<AgentStatus, string> = {
  live: "bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20",
  beta: "bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/20",
  soon: "bg-shade text-faint ring-1 ring-line/60",
};

export interface CardMetric {
  label: string;
  value: string;
  good?: boolean;
}

/** Kartu agent di marketplace. Presentasional — link ke detail. */
export function AgentCard({ agent, metrics }: { agent: AgentMeta; metrics: CardMetric[] }) {
  return (
    <Link
      href={`/marketplace/${agent.id}`}
      className="group flex flex-col rounded-2xl border border-line/60 bg-white p-5 transition hover:-translate-y-0.5 hover:border-line hover:shadow-lg"
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-shade text-2xl">{agent.emoji}</div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLE[agent.status]}`}>
          {agent.status === "live" && <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 align-middle" />}
          {STATUS_LABEL[agent.status]}
        </span>
      </div>
      <div className="font-semibold text-ink">{agent.name}</div>
      <p className="mt-1 flex-1 text-sm text-soft">{agent.tagline}</p>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line/60 pt-3">
        {metrics.map((m) => (
          <div key={m.label}>
            <div className="text-[11px] uppercase tracking-wide text-faint">{m.label}</div>
            <div className={`text-sm font-medium ${m.good === undefined ? "text-ink" : m.good ? "text-emerald-600" : "text-red-600"}`}>
              {m.value}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-sm font-medium text-ink/70 group-hover:text-ink">View & hire →</div>
    </Link>
  );
}
