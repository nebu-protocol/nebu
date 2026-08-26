"use client";

import { useEffect, useMemo, useState } from "react";

import {
  type ChartRange,
  type HistoryPoint,
  PriceChart,
  RANGE_MS,
  RangeTabs,
} from "@/components/charts/price-chart";
import { GeneratedAvatar } from "@/components/generated-avatar";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Chart portfolio LP: seri {timestamp,value} (mis. ETH/USD dari snapshot on-chain),
 * dengan tab rentang. Logic chart di sini (client); data dibaca server dari lp.db.
 */
/** $ besar dgn desimal abu-abu (ala Ondo). */
function BigUsd({ n }: { n: number }) {
  const [int, dec] = n
    .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split(".");
  return (
    <span className="text-3xl font-semibold tracking-tight sm:text-4xl">
      ${int}
      <span className="text-soft">.{dec}</span>
    </span>
  );
}

export function PortfolioChart({
  points,
  label,
  unit = "%",
  headerValue = null,
  welcomeAddress,
}: {
  points: HistoryPoint[];
  label: string;
  unit?: "%" | "$";
  headerValue?: number | null;
  welcomeAddress?: string;
}) {
  const [range, setRange] = useState<ChartRange>("ALL");
  // Jam hidup (client-only → tak ada hydration mismatch). Cocokkan gaya screenshot.
  const [now, setNow] = useState("");
  useEffect(() => {
    if (!welcomeAddress) return;
    const fmt = () =>
      new Date().toLocaleString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
    setNow(fmt());
    const id = setInterval(() => setNow(fmt()), 1000);
    return () => clearInterval(id);
  }, [welcomeAddress]);

  const filtered = useMemo(() => {
    if (points.length === 0) return points;
    const span = RANGE_MS[range];
    if (!Number.isFinite(span)) return points;
    const cutoff = points[points.length - 1].timestamp - span;
    const clipped = points.filter((p) => p.timestamp >= cutoff);
    return clipped.length >= 2 ? clipped : points;
  }, [points, range]);

  const trend =
    filtered.length < 2
      ? "flat"
      : filtered[filtered.length - 1].value >= filtered[0].value
        ? "up"
        : "down";

  return (
    <div className="rounded-2xl border border-line/60 p-5">
      {welcomeAddress && (
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <GeneratedAvatar name={welcomeAddress} size={36} />
            <h2 className="truncate text-base font-medium sm:text-lg">
              Welcome, <span className="font-mono">{short(welcomeAddress)}</span>
            </h2>
          </div>
          <span className="hidden whitespace-nowrap text-sm text-soft sm:block">{now}</span>
        </div>
      )}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          {headerValue != null ? (
            <BigUsd n={headerValue} />
          ) : (
            <span className="text-sm font-medium">{label}</span>
          )}
          {headerValue != null && <div className="mt-0.5 text-xs text-soft">{label}</div>}
        </div>
        <RangeTabs value={range} onChange={setRange} />
      </div>
      {filtered.length < 2 ? (
        <div className="flex h-[180px] items-center justify-center text-sm text-soft">
          Belum cukup data — collector sedang mengumpulkan time-series.
        </div>
      ) : (
        <PriceChart
          points={filtered}
          trend={trend}
          range={range}
          plain
          height={220}
          format={(v) =>
            unit === "%" ? `${v >= 0 ? "+" : ""}${v.toFixed(1)}%` : `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
          }
        />
      )}
    </div>
  );
}
