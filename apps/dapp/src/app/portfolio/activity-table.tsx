"use client";

import { useMemo, useState } from "react";

import { TokenIcon } from "@/components/token-icon";
import { NATIVE } from "@/lib/chain";
import { useT } from "@/lib/i18n-client";
import type { Activity } from "@/lib/lpdata";

const KIND_LABEL: Record<string, string> = {
  SWAP_IN: "Swap in",
  SWAP_OUT: "Swap out",
  MINT: "Open LP",
  BURN: "Close LP",
  WITHDRAW: "Withdraw",
};
// Arah dana ETH: in = ETH masuk ke posisi; out = ETH kembali ke agent/owner.
const DIRECTION: Record<string, "in" | "out" | "close"> = {
  SWAP_IN: "in",
  MINT: "in",
  SWAP_OUT: "out",
  WITHDRAW: "out",
  BURN: "close",
};

const fmtEth = (n: number) => {
  const a = Math.abs(n);
  const dp = a === 0 ? 2 : a >= 1 ? 4 : a >= 0.01 ? 5 : a >= 0.0001 ? 6 : 8;
  return n.toFixed(dp);
};
const fmtTok = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (a >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toPrecision(3);
};
const fmtUsd = (n: number) => {
  const a = Math.abs(n);
  return a >= 1 ? `$${a.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${a.toFixed(a >= 0.01 ? 2 : 4)}`;
};
const timeAgo = (ts: number) => {
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

const LP = <span className="rounded bg-shade px-1 text-[10px] font-semibold text-soft">LP</span>;

/** Alur dana jadi ikon: ETH → token, token → ETH, ETH+token → LP, dst. */
function FlowIcons({
  kind,
  tokenSym,
  tokenAddr,
  dir,
}: {
  kind: string;
  tokenSym: string | null;
  tokenAddr: string | null;
  dir: "in" | "out" | "close";
}) {
  const t = useT();
  const eth = <TokenIcon symbol={NATIVE} size={18} />;
  // Token icon: hover → nama token, klik → halaman token di block explorer.
  const tok = <TokenIcon symbol={tokenSym ?? "?"} address={tokenAddr} size={18} link />;
  const arrow = <span className={dir === "in" ? "text-emerald-600" : "text-red-500"}>→</span>;
  let seq: React.ReactNode[];
  switch (kind) {
    case "SWAP_IN":
      seq = [eth, arrow, tok];
      break;
    case "SWAP_OUT":
      seq = [tok, arrow, eth];
      break;
    case "MINT":
      seq = [eth, tok, arrow, LP];
      break;
    case "BURN":
      seq = [LP, arrow, eth, tok];
      break;
    case "WITHDRAW":
      seq = [eth, arrow, <span className="text-xs text-soft">{t("owner")}</span>];
      break;
    default:
      seq = [<span className="text-xs text-soft">{kind}</span>];
  }
  return (
    <span className="flex items-center gap-1">
      {seq.map((el, i) => (
        <span key={i} className="flex shrink-0 items-center">
          {el}
        </span>
      ))}
    </span>
  );
}

const EXPLORER = "https://robinhoodchain.blockscout.com";
const midTruncate = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`; // 4 depan, 2 belakang
const ACTIONS = ["ALL", "SWAP_IN", "SWAP_OUT", "MINT", "BURN", "WITHDRAW"] as const;
const STATUSES = ["ALL", "CONFIRMED", "SENT", "FAILED"] as const;
const PAGE_SIZE = 12;

export function ActivityTable({ rows, ethUsd }: { rows: Activity[]; ethUsd: number | null }) {
  const t = useT();
  const [action, setAction] = useState<(typeof ACTIONS)[number]>("ALL");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("ALL");
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<"time" | "amount">("time");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = rows.filter(
      (r) =>
        (action === "ALL" || r.kind === action) &&
        (status === "ALL" || r.status === status) &&
        (needle === "" ||
          (r.pair ?? "").toLowerCase().includes(needle) ||
          (KIND_LABEL[r.kind] ?? r.kind).toLowerCase().includes(needle)),
    );
    f.sort((a, b) => {
      const v = sortKey === "time" ? a.ts - b.ts : (a.amountEth ?? 0) - (b.amountEth ?? 0);
      return asc ? v : -v;
    });
    return f;
  }, [rows, action, status, q, sortKey, asc]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pages - 1);
  const slice = filtered.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (k: "time" | "amount") => {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(false);
    }
    setPage(0);
  };

  const selCls = "rounded-lg border border-line/60 bg-transparent px-2 py-1 text-xs";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{t("Activity")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder={t("Cari pair / aksi…")}
            className="w-36 rounded-lg border border-line/60 bg-transparent px-2 py-1 text-xs outline-none focus:border-ink"
          />
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as (typeof ACTIONS)[number]);
              setPage(0);
            }}
            className={selCls}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a === "ALL" ? t("All actions") : t(KIND_LABEL[a] ?? a)}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as (typeof STATUSES)[number]);
              setPage(0);
            }}
            className={selCls}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? t("All status") : s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-line/60">
        <table className="w-full min-w-[540px] whitespace-nowrap text-sm">
          <thead className="border-b border-line/60 text-soft">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium">{t("Action")}</th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium">{t("Flow")}</th>
              <th
                className="cursor-pointer whitespace-nowrap px-3 py-3 text-right font-medium hover:text-ink"
                onClick={() => toggleSort("amount")}
              >
                {t("Amount")} {sortKey === "amount" ? (asc ? "↑" : "↓") : ""}
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-left font-medium">{t("Status")}</th>
              <th
                className="cursor-pointer whitespace-nowrap px-3 py-3 text-right font-medium hover:text-ink"
                onClick={() => toggleSort("time")}
              >
                {t("When")} {sortKey === "time" ? (asc ? "↑" : "↓") : ""}
              </th>
              <th className="whitespace-nowrap px-3 py-3 text-right font-medium">{t("Tx")}</th>
            </tr>
          </thead>
          <tbody>
            {slice.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-soft">
                  {t("Tidak ada aktivitas untuk filter ini.")}
                </td>
              </tr>
            )}
            {slice.map((a, i) => {
              const dir = DIRECTION[a.kind] ?? "in";
              return (
                <tr key={`${a.ts}-${i}`} className="border-t border-line/60">
                  <td className="whitespace-nowrap px-3 py-3 font-medium">{t(KIND_LABEL[a.kind] ?? a.kind)}</td>
                  <td className="px-3 py-3">
                    <FlowIcons kind={a.kind} tokenSym={a.tokenSym} tokenAddr={a.tokenAddr} dir={dir} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    {a.kind === "BURN" && a.closeNetPct !== null ? (
                      <span className={a.closeNetPct >= 0 ? "text-emerald-600" : "text-red-600"}>
                        {a.closeNetPct >= 0 ? "+" : ""}
                        {a.closeNetPct.toFixed(2)}%
                      </span>
                    ) : a.amountEth === null ? (
                      "—"
                    ) : (
                      <span
                        title={`${fmtEth(a.amountEth)} ETH${a.tokenAmount !== null ? ` · ${fmtTok(a.tokenAmount)} ${a.tokenSym ?? ""}` : ""}`}
                      >
                        {dir === "out" ? "+" : dir === "in" ? "−" : ""}
                        {ethUsd ? fmtUsd(a.amountEth * ethUsd) : `${fmtEth(a.amountEth)} ETH`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`text-xs ${
                        a.status === "CONFIRMED"
                          ? "text-emerald-600"
                          : a.status === "FAILED"
                            ? "text-red-600"
                            : a.status === "SENT"
                              ? "text-blue-600"
                              : "text-soft"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-soft">{timeAgo(a.ts)}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">
                    {a.txHash ? (
                      <a
                        href={`${EXPLORER}/tx/${a.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#4f7cff] hover:underline"
                      >
                        {midTruncate(a.txHash)}
                      </a>
                    ) : (
                      <span className="text-soft">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-soft">
        <span>
          {filtered.length} {t("aktivitas · hal")} {clampedPage + 1}/{pages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setPage(Math.max(0, clampedPage - 1))}
            disabled={clampedPage === 0}
            className="rounded-lg border border-line/60 px-2 py-1 hover:bg-shade disabled:opacity-40"
          >
            {t("← prev")}
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.min(pages - 1, clampedPage + 1))}
            disabled={clampedPage >= pages - 1}
            className="rounded-lg border border-line/60 px-2 py-1 hover:bg-shade disabled:opacity-40"
          >
            {t("next →")}
          </button>
        </div>
      </div>
    </div>
  );
}
