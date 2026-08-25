"use client";

import { useCallback, useRef, useState } from "react";

import { PortfolioChart } from "@/components/portfolio-chart";
import { Sparkline } from "@/components/sparkline";
import type { HistoryPoint } from "@/components/charts/price-chart";

type Position = {
  pair: string;
  net_pct: number;
  fees_pct: number;
  il_pct: number;
  history: HistoryPoint[];
};
type Data = {
  portfolio: { fundEth: number; ethUsd: number | null; positions: number; avgNet: number | null; winners: number };
  series: HistoryPoint[];
  positions: Position[];
};

const fmtUsd = (n: number | null) =>
  n === null ? "—" : n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const netClass = (n: number) => (n >= 0 ? "text-emerald-600" : "text-red-600");

export function PortfolioClient() {
  const [address, setAddress] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (addr: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: addr }),
      });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? "gagal memuat");
        return;
      }
      setData(await res.json());
    } catch {
      setError("gagal menghubungi server");
    } finally {
      setLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    const eth = (window as unknown as { ethereum?: { request: (a: { method: string }) => Promise<string[]> } })
      .ethereum;
    if (!eth) {
      setError("Wallet tidak terdeteksi. Pasang MetaMask atau wallet EVM lain.");
      return;
    }
    try {
      const [addr] = await eth.request({ method: "eth_requestAccounts" });
      if (!addr) return;
      setAddress(addr);
      await load(addr);
    } catch {
      setError("Koneksi wallet dibatalkan.");
    }
  }, [load]);

  const [signing, setSigning] = useState(false);
  const signToManage = useCallback(async () => {
    if (!address) return;
    const eth = (
      window as unknown as { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } }
    ).ethereum;
    if (!eth) return;
    setSigning(true);
    setError(null);
    try {
      const nres = await fetch("/api/siwe/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const { message } = (await nres.json()) as { message: string };
      const signature = (await eth.request({ method: "personal_sign", params: [message, address] })) as string;
      const vres = await fetch("/api/siwe/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      if (!vres.ok) {
        setError((await vres.json().catch(() => ({}))).error ?? "verifikasi gagal");
        return;
      }
      window.location.reload(); // server akan render panel manage
    } catch {
      setError("Tanda tangan dibatalkan.");
    } finally {
      setSigning(false);
    }
  }, [address]);

  if (!address || !data) {
    return (
      <div className="mx-auto max-w-sm rounded-xl border border-line/60 p-6 text-center">
        <h2 className="text-lg font-medium">Connect wallet</h2>
        <p className="mt-1 text-sm text-soft">
          Hubungkan wallet untuk melihat portfolio & PnL posisi kamu.
        </p>
        <button
          type="button"
          onClick={connect}
          disabled={loading}
          className="mt-4 w-full rounded-lg bg-ink px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {loading ? "Memuat…" : "Connect Wallet"}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const { portfolio: p } = data;
  const fundUsd = p.ethUsd ? p.fundEth * p.ethUsd : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm text-soft">
          {address.slice(0, 6)}…{address.slice(-4)}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={signToManage}
            disabled={signing}
            className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {signing ? "Menandatangani…" : "Sign to manage"}
          </button>
          <button type="button" onClick={() => load(address)} className="text-sm text-soft hover:text-ink">
            ↻ refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Deployed fund" value={fmtUsd(fundUsd)} sub={`${p.fundEth.toFixed(3)} ETH`} />
        <Stat label="Open positions" value={String(p.positions)} />
        <Stat
          label="Avg net vs HODL"
          value={p.avgNet === null ? "—" : pct(p.avgNet)}
          sub={p.positions ? `${p.winners}/${p.positions} beat HODL` : undefined}
        />
        <Stat label="ETH price" value={fmtUsd(p.ethUsd)} />
      </div>

      <PortfolioChart points={data.series} label="Portfolio net vs HODL (%)" />

      <div>
        <h3 className="mb-2 text-sm font-medium">Positions</h3>
        <div className="overflow-hidden rounded-xl border border-line/60">
          <table className="w-full text-sm">
            <thead className="bg-shade text-soft">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Pair</th>
                <th className="px-4 py-2 text-right font-medium">Fees</th>
                <th className="px-4 py-2 text-right font-medium">IL</th>
                <th className="px-4 py-2 text-right font-medium">Net</th>
                <th className="px-4 py-2 text-right font-medium">History</th>
              </tr>
            </thead>
            <tbody>
              {data.positions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-soft">
                    Wallet ini belum punya posisi. Tambah wallet & aktifkan automation untuk mulai.
                  </td>
                </tr>
              )}
              {data.positions.map((pos) => (
                <tr key={pos.pair} className="border-t border-line/60">
                  <td className="px-4 py-2 font-medium">{pos.pair}</td>
                  <td className="px-4 py-2 text-right text-emerald-600">+{pos.fees_pct.toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right text-red-600">{pos.il_pct.toFixed(2)}%</td>
                  <td className={`px-4 py-2 text-right font-medium ${netClass(pos.net_pct)}`}>{pct(pos.net_pct)}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end">
                      {pos.history.length >= 2 ? (
                        <Sparkline
                          values={pos.history.map((h) => h.value)}
                          trend={pos.net_pct >= 0 ? "up" : "down"}
                        />
                      ) : (
                        <span className="text-xs text-soft">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line/60 p-4">
      <div className="text-xs text-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-soft">{sub}</div>}
    </div>
  );
}
