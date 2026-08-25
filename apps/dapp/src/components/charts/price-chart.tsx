"use client";

// The template's charts/price-chart.tsx verbatim, with the chart types
// inlined (the dapp charts USDC amounts instead of API price history).

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { fmtPrice, TREND_COLOR, TREND_FILL, type Trend } from "@/lib/format";

import { areaPath, linePath, niceTicks, scaleSeries } from "./path";

export type HistoryPoint = { timestamp: number; value: number };

export type ChartRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";

export const CHART_RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

const DAY_MS = 86_400_000;

/** Lookback per range tab; ALL is unbounded (callers clamp to their history start). */
export const RANGE_MS: Record<ChartRange, number> = {
  "1D": DAY_MS,
  "1W": 7 * DAY_MS,
  "1M": 30 * DAY_MS,
  "3M": 91 * DAY_MS,
  "1Y": 365 * DAY_MS,
  ALL: Number.POSITIVE_INFINITY,
};

/** The template's range-tab pill row (portfolio + invoice detail). */
export function RangeTabs({
  value,
  onChange,
  className = "flex",
}: Readonly<{
  value: ChartRange;
  onChange: (range: ChartRange) => void;
  className?: string;
}>) {
  return (
    <div className={`gap-1 rounded-lg bg-shade p-1 ${className}`}>
      {CHART_RANGES.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={`rounded-md px-2.5 py-1 font-mono text-xs ${
            value === r ? "bg-white font-medium text-ink shadow-sm" : "text-soft"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

const HEIGHT = 380;
const FLAT_PAD = 0.06; // domain padding so a flat series centers with ticks
const PX_PER_X_LABEL = 110;
const TOOLTIP_HALF_WIDTH = 70;
const AXIS_MARGIN = {
  right: { top: 16, right: 64, bottom: 28, left: 8 },
  left: { top: 16, right: 12, bottom: 28, left: 8 },
};

const BG: Record<Trend, string> = {
  up: "bg-[#f3f8f4]",
  down: "bg-[#fbf5f4]",
  flat: "bg-[#f6f6f5]",
};

/** "$0.02" / "-$0.02" — the sign belongs before the dollar. */
const tickLabel = (t: number) => (t < 0 ? `-$${fmtPrice(Math.abs(t))}` : `$${fmtPrice(t)}`);

function xLabel(ts: number, range: ChartRange): string {
  const d = new Date(ts);
  if (range === "1D")
    return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (range === "ALL") return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function tooltipLabel(ts: number, range: ChartRange): string {
  const d = new Date(ts);
  if (range === "1D")
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function PriceChart({
  points,
  trend,
  range,
  axis = "right",
  plain = false,
}: Readonly<{
  points: HistoryPoint[];
  trend: Trend;
  range: ChartRange;
  /** Which side carries the price labels. */
  axis?: "left" | "right";
  /** White background instead of the trend tint (portfolio style). */
  plain?: boolean;
}>) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const margin = AXIS_MARGIN[axis];
  const axisWidth = axis === "left" ? 48 : 0;
  const plotLeft = margin.left + axisWidth;
  const plotW = Math.max(0, width - plotLeft - margin.right);
  const plotH = HEIGHT - margin.top - margin.bottom;

  const { pts, ticks, min, span, data } = useMemo(() => {
    // A single null/NaN value must not blank the whole chart.
    const data = points.filter((p) => Number.isFinite(p.value));
    if (data.length < 2 || plotW <= 0) return { pts: [], ticks: [], min: 0, span: 1, data };
    const { pts, min, span } = scaleSeries(
      data.map((p) => p.value),
      {
        width: plotW,
        height: HEIGHT,
        x0: plotLeft,
        padTop: margin.top,
        padBottom: margin.bottom,
        flatPad: FLAT_PAD,
      },
    );
    return { pts, ticks: niceTicks(min, min + span, 5), min, span, data };
  }, [points, plotW, plotLeft, margin.top, margin.bottom]);

  const xTickIdx = useMemo(() => {
    if (pts.length === 0) return [];
    const count = Math.max(2, Math.min(7, Math.floor(plotW / PX_PER_X_LABEL)));
    const idx = Array.from({ length: count }, (_, i) =>
      Math.round((i * (pts.length - 1)) / (count - 1)),
    );
    return [...new Set(idx)]; // short series would repeat indices (dup keys)
  }, [pts.length, plotW]);

  const onMove = (e: React.PointerEvent) => {
    const el = containerRef.current;
    if (pts.length === 0 || !el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - plotLeft;
    const i = Math.round((x / plotW) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };

  const h = hover != null && pts[hover] ? hover : null;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden rounded-2xl ${plain ? "bg-white" : BG[trend]}`}
      style={{ height: HEIGHT }}
      onPointerMove={onMove}
      onPointerLeave={() => setHover(null)}
    >
      {pts.length > 0 && (
        // max-w-full breaks the feedback loop where a transiently wide
        // measurement would lock the grid track via the numeric width attr.
        <svg width={width} height={HEIGHT} aria-hidden className="block max-w-full">
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop stopColor={TREND_FILL[trend]} stopOpacity="0.22" />
              <stop offset="1" stopColor={TREND_FILL[trend]} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => {
            const y = margin.top + (1 - (t - min) / span) * plotH;
            return (
              <g key={t}>
                <line
                  x1={plotLeft}
                  x2={plotLeft + plotW}
                  y1={y}
                  y2={y}
                  stroke="#111827"
                  strokeOpacity="0.08"
                  strokeDasharray="3 4"
                />
                <text
                  x={axis === "left" ? margin.left : width - margin.right + 10}
                  y={y + 4}
                  fontSize="11"
                  fill="#83878b"
                  className="tabular"
                >
                  {tickLabel(t)}
                </text>
              </g>
            );
          })}
          {xTickIdx.map((i, n) => {
            // Edge labels anchor inward so they never clip the container.
            let anchor: "start" | "middle" | "end" = "middle";
            if (n === 0) anchor = "start";
            if (n === xTickIdx.length - 1) anchor = "end";
            return (
              <text
                key={data[i].timestamp}
                x={pts[i].x}
                y={HEIGHT - 8}
                fontSize="11"
                fill="#83878b"
                textAnchor={anchor}
              >
                {xLabel(data[i].timestamp, range)}
              </text>
            );
          })}
          {/* Keyed by range so switching timeframes replays the entrance
              animation; refetches keep the same key and update in place. */}
          <g key={range}>
            <path
              d={areaPath(pts, margin.top + plotH)}
              fill={`url(#${id})`}
              className="chart-area"
            />
            <path
              d={linePath(pts)}
              fill="none"
              style={{ stroke: TREND_COLOR[trend] }}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              className="chart-line"
            />
          </g>
          {h != null && (
            <g>
              <line
                x1={pts[h].x}
                x2={pts[h].x}
                y1={margin.top}
                y2={margin.top + plotH}
                stroke="#6f7377"
                strokeDasharray="3 3"
              />
              <circle
                cx={pts[h].x}
                cy={pts[h].y}
                r="4.5"
                style={{ fill: TREND_COLOR[trend] }}
                stroke="#fff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      )}
      {h != null && (
        <div
          className="pointer-events-none absolute top-3 z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-1.5 shadow-sm"
          style={{
            left: Math.max(TOOLTIP_HALF_WIDTH, Math.min(width - TOOLTIP_HALF_WIDTH, pts[h].x)),
          }}
        >
          <div className="tabular text-sm font-medium">${fmtPrice(data[h].value)}</div>
          <div className="text-[11px] whitespace-nowrap text-soft">
            {tooltipLabel(data[h].timestamp, range)}
          </div>
        </div>
      )}
    </div>
  );
}
