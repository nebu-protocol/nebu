"use client";

import { useMemo, useState } from "react";

import { MiniLine } from "@/components/mini-line";
import { TokenIcon, tokenUrl } from "@/components/token-icon";
import type { PoolRow } from "@/lib/lpdata";

const SORTS = [
  { key: "apr", label: "APR" },
  { key: "vol", label: "Volume" },
  { key: "active", label: "Most active" },
  { key: "momentum", label: "Momentum" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

const kfmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${Math.round(n)}`);

function Chg({ v }: { v: number | null }) {
  if (v === null) return <span className="text-soft">—</span>;
  return (
    <span className={v >= 0 ? "text-emerald-600" : "text-red-600"}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(2)}%
    </span>
  );
}

/** Explorer pool ala launchpad — tabel + search + sort. Data BNB real. */
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

      <div className="overflow-x-auto rounded-2xl border border-line/60">
        <table className="w-full text-sm">
          <thead className="border-b border-line/60 text-soft">
            <tr>
              <th className="hidden px-4 py-3 text-left font-medium sm:table-cell">#</th>
              <th className="px-4 py-3 text-left font-medium">Pool</th>
              <th className="px-4 py-3 text-right font-medium">APR</th>
              <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">Δ recent</th>
              <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Vol (BNB)</th>
              <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">Swaps/h</th>
              <th className="hidden px-4 py-3 text-right font-medium md:table-cell">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-soft">
                  No pools match “{q}”.
                </td>
              </tr>
            )}
            {rows.map((p, i) => (
              <tr key={p.poolId} className="border-t border-line/60 hover:bg-shade/40">
                <td className="hidden px-4 py-3 text-soft sm:table-cell">{i + 1}</td>
                <td className="px-4 py-3">
                  <a
                    href={tokenUrl(p.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 transition hover:opacity-70"
                  >
                    <TokenIcon symbol={p.sym1} address={p.address} size={28} />
                    <span className="font-medium hover:underline">{p.pair}</span>
                  </a>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-emerald-600">{p.apr20.toFixed(1)}%</td>
                <td className="hidden whitespace-nowrap px-4 py-3 text-right sm:table-cell">
                  <Chg v={p.changePct} />
                </td>
                <td className="hidden px-4 py-3 text-right md:table-cell">{kfmt(p.volEth ?? 0)}</td>
                <td className="hidden px-4 py-3 text-right lg:table-cell">{p.swapsPerH.toFixed(0)}</td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <div className="flex justify-end">
                    <MiniLine values={p.spark} up={(p.changePct ?? 0) >= 0} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
