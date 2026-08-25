"use client";

import { useMemo, useState } from "react";

import {
  type ChartRange,
  type HistoryPoint,
  PriceChart,
  RANGE_MS,
  RangeTabs,
} from "@/components/charts/price-chart";

/**
 * Chart portfolio LP: seri {timestamp,value} (mis. ETH/USD dari snapshot on-chain),
 * dengan tab rentang. Logic chart di sini (client); data dibaca server dari lp.db.
 */
export function PortfolioChart({
  points,
  label,
  unit = "%",
}: {
  points: HistoryPoint[];
  label: string;
  unit?: "%" | "$";
}) {
  const [range, setRange] = useState<ChartRange>("ALL");

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
    <div className="rounded-xl border border-line/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
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
