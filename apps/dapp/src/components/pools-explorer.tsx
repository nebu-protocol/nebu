"use client";

import { useMemo, useState } from "react";

import { PoolCard } from "@/components/pool-card";
import type { PoolRow } from "@/lib/lpdata";

const SORTS = [
  { key: "apr", label: "APR" },
  { key: "vol", label: "Volume" },
  { key: "active", label: "Most active" },
  { key: "momentum", label: "Momentum" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

/** Explorer pool ala launchpad: search + sort tabs → grid padat. */
export function PoolsExplorer({ pools }: { pools: PoolRow[] }) {
  const [sort, setSort] = useState<SortKey>("apr");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle ? pools.filter((p) => p.pair.toLowerCase().includes(needle)) : pools;
    const s = [...filtered];
    if (sort === "apr") s.sort((a, b) => b.apr20 - a.apr20);
    else if (sort === "vol") s.sort((a, b) => (b.volEth ?? 0) - (a.volEth ?? 0));
    else if (sort === "active") s.sort((a, b) => b.swapsPerH - a.swapsPerH);
    else s.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    return s;
  }, [pools, sort, q]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Opportunities <span className="ml-1 text-sm font-normal text-soft">{pools.length} BNB pools</span>
        </h2>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pools"
            className="w-32 rounded-lg border border-line/60 bg-white px-3 py-1.5 text-sm outline-none focus:border-ink sm:w-40"
          />
          <div className="flex gap-0.5 rounded-lg border border-line/60 p-0.5">
            {SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSort(s.key)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${sort === s.key ? "bg-shade text-ink" : "text-soft hover:text-ink"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {rows.map((p) => (
          <PoolCard key={p.poolId} p={p} />
        ))}
      </div>
      {rows.length === 0 && <p className="py-8 text-center text-sm text-soft">No pools match “{q}”.</p>}
    </div>
  );
}
