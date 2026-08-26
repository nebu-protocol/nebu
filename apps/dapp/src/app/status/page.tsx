import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { checkRpc, getSystemStatus } from "@/lib/lpdata";

export const metadata: Metadata = { title: "Status" };
export const dynamic = "force-dynamic";

type State = "ok" | "warn" | "down";
const DOT: Record<State, string> = { ok: "bg-emerald-500", warn: "bg-amber-500", down: "bg-red-500" };
const LABEL: Record<State, string> = { ok: "Normal", warn: "Perlu perhatian", down: "Bermasalah" };

const ageStr = (sec: number | null) => {
  if (sec == null) return "belum ada";
  if (sec < 60) return `${sec}s lalu`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m lalu`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h lalu`;
  return `${Math.floor(sec / 86400)}d lalu`;
};
const whenStr = (ts: number) => new Date(ts * 1000).toLocaleString("en-US", { hour12: false });

/** Kartu status satu komponen. */
function StatusCard({ label, state, value, sub }: { label: string; state: State; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line/60 p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-soft">{label}</span>
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <span className={`h-2 w-2 rounded-full ${DOT[state]}`} />
          {LABEL[state]}
        </span>
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-soft">{sub}</div>}
    </div>
  );
}

export default async function StatusPage() {
  const s = getSystemStatus();
  const rpc = await checkRpc();

  const collectorAge = s.collector.ts ? s.now - s.collector.ts : null;
  const priceAge = s.price.ts ? s.now - s.price.ts : null;
  const snapAge = s.snapshot.ts ? s.now - s.snapshot.ts : null;

  // Ambang kesehatan (heartbeat collector ~1-2m; siklus penuh ~60m).
  const collectorState: State = collectorAge == null ? "down" : collectorAge < 300 ? "ok" : collectorAge < 900 ? "warn" : "down";
  const rpcState: State = rpc.ok ? (rpc.ms < 3000 ? "ok" : "warn") : "down";
  const priceState: State = priceAge == null ? "down" : priceAge < 5400 ? "ok" : priceAge < 10800 ? "warn" : "down";
  const dbState: State = snapAge == null ? "down" : snapAge < 5400 ? "ok" : snapAge < 10800 ? "warn" : "down";

  const overall: State = [collectorState, rpcState, priceState, dbState].includes("down")
    ? "down"
    : [collectorState, rpcState, priceState, dbState].includes("warn")
      ? "warn"
      : "ok";

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-6 flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${DOT[overall]}`} />
          <h1 className="text-2xl font-semibold tracking-tight">System status</h1>
          <span className="text-sm text-soft">— {LABEL[overall]}</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatusCard
            label="Bot (collector)"
            state={collectorState}
            value={collectorAge == null ? "Belum jalan" : `Heartbeat ${ageStr(collectorAge)}`}
            sub={s.collector.phase ? `fase: ${s.collector.phase}` : undefined}
          />
          <StatusCard
            label="RPC / Chain"
            state={rpcState}
            value={rpc.ok ? `Block ${rpc.block?.toLocaleString()}` : "Tak merespons"}
            sub={`latensi ${rpc.ms}ms`}
          />
          <StatusCard
            label="Price feed (ETH/USD)"
            state={priceState}
            value={s.price.ethUsd ? `$${s.price.ethUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
            sub={`${s.price.source ?? "?"} · ${ageStr(priceAge)}`}
          />
          <StatusCard
            label="Database"
            state={dbState}
            value={`${s.snapshot.pools.toLocaleString()} pools`}
            sub={`snapshot ${ageStr(snapAge)}`}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-line/60 p-5 sm:grid-cols-4">
          <div>
            <div className="text-xs text-soft">Open positions</div>
            <div className="mt-0.5 text-lg font-semibold">{s.positions.open}</div>
          </div>
          <div>
            <div className="text-xs text-soft">Closed positions</div>
            <div className="mt-0.5 text-lg font-semibold">{s.positions.closed}</div>
          </div>
          <div>
            <div className="text-xs text-soft">Strategy edge</div>
            <div className="mt-0.5 text-lg font-semibold">{s.edge.ratio != null ? `${s.edge.ratio.toFixed(2)}:1` : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-soft">Win rate</div>
            <div className="mt-0.5 text-lg font-semibold">{s.edge.winRate != null ? `${s.edge.winRate}%` : "—"}</div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-line/60 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Error log</h3>
            <span className="text-xs text-soft">{s.errors.failed} gagal / 24 jam</span>
          </div>
          {s.errors.recent.length === 0 ? (
            <p className="mt-2 text-sm text-emerald-600">Tidak ada error tercatat ✓</p>
          ) : (
            <div className="mt-3 space-y-2">
              {s.errors.recent.map((e, i) => (
                <div key={`${e.ts}-${i}`} className="rounded-lg bg-shade px-3 py-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-red-600">{e.kind} FAILED</span>
                    <span className="text-soft">{whenStr(e.ts)}</span>
                  </div>
                  {e.detail && <div className="mt-0.5 break-words font-mono text-[11px] text-soft">{e.detail}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="mt-4 text-xs text-soft">
          Auto-refresh saat dibuka ulang. Heartbeat ditulis collector tiap siklus + exit-watch (~1-2 menit).
        </p>
      </main>
    </>
  );
}
