"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { type ActiveHire, hireAgentAction, revokeHireAction } from "@/server/hire-actions";

const DAYS = [7, 30, 90] as const;

function daysLeft(expiryTs: number): number {
  return Math.max(0, Math.ceil((expiryTs * 1000 - Date.now()) / 86_400_000));
}

/** Panel hire di detail agent: sign-in gate → form scope (cap+durasi) → sesi aktif + revoke. */
export function HirePanel({ agentId, authed, active }: { agentId: string; authed: boolean; active: ActiveHire | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cap, setCap] = useState("0.5");
  const [days, setDays] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  if (!authed) {
    return (
      <div className="rounded-2xl border border-line/60 p-5">
        <div className="font-medium">Sign in to hire</div>
        <p className="mt-1 text-sm text-soft">Connect and verify your wallet to grant this agent a scoped session.</p>
        <Link href="/portfolio" className="mt-3 inline-block rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
          Connect wallet
        </Link>
      </div>
    );
  }

  if (active) {
    const left = daysLeft(active.expiryTs);
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          <span className="font-medium text-emerald-700">Hired · session active</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-faint">Budget cap</div>
            <div className="font-medium">{active.capEth} BNB</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-faint">Expires in</div>
            <div className="font-medium">{left} {left === 1 ? "day" : "days"}</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-soft">
          The agent can work within this cap until it expires. It can never withdraw — revoke anytime.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await revokeHireAction(agentId);
              router.refresh();
            })
          }
          className="mt-3 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/5 disabled:opacity-60"
        >
          {pending ? "Revoking…" : "Revoke session"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-line/60 p-5">
      <div className="font-medium">Hire this agent</div>
      <p className="mt-1 text-sm text-soft">Grant a scoped, revocable session on your vault.</p>
      <div className="mt-4 space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-faint">Budget cap (BNB)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            className="mt-1 w-full rounded-xl border border-line/60 bg-white px-3 py-2 text-sm outline-none focus:border-ink"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-faint">Duration</label>
          <div className="mt-1 flex gap-2">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm ${days === d ? "border-ink bg-ink text-white" : "border-line/60 text-soft hover:bg-shade"}`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const r = await hireAgentAction(agentId, Number(cap), days);
            if (!r.ok) setError(r.error ?? "Failed to hire.");
            else router.refresh();
          });
        }}
        className="mt-4 w-full rounded-xl bg-ink px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Granting session…" : "Grant session & hire"}
      </button>
      <p className="mt-2 text-center text-xs text-faint">Non-custodial · funds never leave your vault · revoke anytime</p>
    </div>
  );
}
