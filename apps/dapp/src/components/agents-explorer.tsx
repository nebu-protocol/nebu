"use client";

import { useMemo, useState } from "react";

import { AgentCard, type CardMetric } from "@/components/agent-card";
import type { AgentMeta, AgentStatus } from "@/lib/agents";

export type AgentItem = { agent: AgentMeta; metrics: CardMetric[] };

const CATS: [string, string][] = [
  ["all", "All categories"],
  ["rebalancing", "Rebalancing"],
  ["grid", "Grid"],
  ["yield", "Yield"],
  ["health", "Health factor"],
];
const STATUSES: [string, string][] = [
  ["all", "All access"],
  ["live", "Live"],
  ["beta", "Beta"],
  ["soon", "Coming soon"],
];
const SORTS: [string, string][] = [
  ["featured", "Featured"],
  ["az", "A–Z"],
];

const RANK: Record<AgentStatus, number> = { live: 0, beta: 1, soon: 2 };

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-line/60 bg-white px-4 py-2.5 text-sm font-medium text-ink outline-none hover:border-ink focus:border-ink"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** Explorer agent ala OpenSea: search + filter kategori/akses/sort → grid kartu. */
export function AgentsExplorer({ items }: { items: AgentItem[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [st, setSt] = useState("all");
  const [sort, setSort] = useState("featured");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let r = items.filter(
      ({ agent }) =>
        (cat === "all" || agent.category === cat) &&
        (st === "all" || agent.status === st) &&
        (!needle || `${agent.name} ${agent.tagline} ${agent.description}`.toLowerCase().includes(needle)),
    );
    r = [...r].sort((a, b) =>
      sort === "az" ? a.agent.name.localeCompare(b.agent.name) : RANK[a.agent.status] - RANK[b.agent.status],
    );
    return r;
  }, [items, q, cat, st, sort]);

  const chips = [cat !== "all" && CATS.find((c) => c[0] === cat)?.[1], st !== "all" && STATUSES.find((s) => s[0] === st)?.[1]].filter(
    Boolean,
  ) as string[];

  return (
    <section id="agents">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, tag, or description…"
          className="min-w-[220px] flex-1 rounded-full border border-line/60 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
        <Select value={cat} onChange={setCat} options={CATS} />
        <Select value={st} onChange={setSt} options={STATUSES} />
        <Select value={sort} onChange={setSort} options={SORTS} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold tracking-wide text-soft">{rows.length} AGENTS</span>
        {chips.map((c) => (
          <span key={c} className="rounded-full bg-shade px-3 py-1 text-xs font-medium text-ink ring-1 ring-line/60">
            {c}
          </span>
        ))}
        {(chips.length > 0 || q) && (
          <button
            type="button"
            onClick={() => {
              setCat("all");
              setSt("all");
              setQ("");
            }}
            className="text-xs font-medium text-soft hover:text-ink"
          >
            Clear all
          </button>
        )}
      </div>

      <h2 className="mb-3 text-xl font-semibold tracking-tight">All agents</h2>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-soft">No agents match your filters.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map(({ agent, metrics }) => (
            <AgentCard key={agent.id} agent={agent} metrics={metrics} />
          ))}
        </div>
      )}
    </section>
  );
}
