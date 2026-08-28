"use client";

import Link from "next/link";
import { useState } from "react";

import { recommend, type Reco } from "@/lib/concierge";

const EXAMPLES = [
  "Earn yield on idle BNB, low risk",
  "Protect my Venus loan from liquidation",
  "Trade a sideways market automatically",
  "Provide liquidity and farm fees on PancakeSwap",
];

/** Concierge: tulis tujuan dlm bahasa natural → rekomendasi agent (+tim) instan. */
export function Concierge() {
  const [q, setQ] = useState("");
  const [reco, setReco] = useState<Reco | null>(null);

  const run = (text: string) => {
    const t = text.trim();
    if (!t) return;
    setQ(text);
    setReco(recommend(t));
  };

  return (
    <div className="rounded-2xl border border-line/60 bg-shade/40 p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
        <span>✦</span> {"Concierge — tell it your goal, get the right agent"}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(q);
        }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. earn yield on idle BNB, low risk"
          className="flex-1 rounded-xl border border-line/60 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"
        />
        <button type="submit" className="rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
          Ask
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => run(ex)}
            className="rounded-full border border-line/60 bg-white px-3 py-1 text-xs text-soft hover:border-ink hover:text-ink"
          >
            {ex}
          </button>
        ))}
      </div>

      {reco && (
        <div className="mt-4 rounded-xl border border-line/60 bg-white p-4">
          <div className="text-[11px] uppercase tracking-wide text-faint">Recommended</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {reco.team.map((a, i) => (
              <span key={a.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-faint">+</span>}
                <Link
                  href={`/marketplace/${a.id}`}
                  className="flex items-center gap-2 rounded-full border border-line/60 px-3 py-1.5 text-sm font-medium hover:border-ink"
                >
                  <span>{a.emoji}</span> {a.name}
                </Link>
              </span>
            ))}
            <span className="ml-1 rounded-full bg-shade px-2.5 py-1 text-xs capitalize text-soft">{reco.risk} risk</span>
            {reco.capBnb != null && (
              <span className="rounded-full bg-shade px-2.5 py-1 text-xs text-soft">~{reco.capBnb} BNB budget</span>
            )}
          </div>
          <p className="mt-3 text-sm text-soft">{reco.reason}</p>
          <Link
            href={`/marketplace/${reco.primary.id}`}
            className="mt-3 inline-block rounded-xl bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            View &amp; hire {reco.primary.name} →
          </Link>
        </div>
      )}
    </div>
  );
}
