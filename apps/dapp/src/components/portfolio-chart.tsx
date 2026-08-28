"use client";

import { useMemo, useState } from "react";

import { useT } from "@/lib/i18n-client";

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
}: {
  points: HistoryPoint[];
  label: string;
  unit?: "%" | "$";
  headerValue?: number | null;
}) {
  const t = useT();
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
    <div className="rounded-2xl border border-line/60 p-5">
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
          {t("Belum cukup data — collector sedang mengumpulkan time-series.")}
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
