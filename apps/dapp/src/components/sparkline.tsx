"use client";

import { useId } from "react";

import { TREND_COLOR, TREND_FILL, type Trend } from "@/lib/format";

// Verbatim from the template's charts/sparkline.tsx (path helpers inlined).
// The viewBox is stretched to the container (preserveAspectRatio="none"),
// so the stroke uses non-scaling-stroke to stay 1.5px.
const W = 346;
const H = 110;
const PAD_TOP = 8;

type XY = { x: number; y: number };

function scalePoints(values: number[]): XY[] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return [];
  const min = Math.min(...finite);
  const span = Math.max(...finite) - min || 1;
  const step = W / (finite.length - 1);
  return finite.map((v, i) => ({
    x: +(i * step).toFixed(2),
    y: +(PAD_TOP + (1 - (v - min) / span) * (H - PAD_TOP)).toFixed(2),
  }));
}

function linePath(pts: XY[]): string {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join("");
}

function areaPath(pts: XY[]): string {
  const first = pts[0];
  const last = pts.at(-1);
  if (!first || !last) return "";
  return `${linePath(pts)}L${last.x},${H}L${first.x},${H}Z`;
}

export function Sparkline({
  values,
  trend,
  animate = true,
  className = "",
}: Readonly<{
  values: number[];
  trend: Trend;
  /** The reveal plays when this flips true (e.g. on entering the viewport). */
  animate?: boolean;
  className?: string;
}>) {
  const id = useId();
  const pts = scalePoints(values);
  if (pts.length === 0) return <div className={className} />;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      preserveAspectRatio="none"
      className={`${animate ? "chart-reveal" : ""} block h-full w-full ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor={TREND_FILL[trend]} stopOpacity="0.24" />
          <stop offset="1" stopColor={TREND_FILL[trend]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath(pts)} fill={`url(#${id})`} />
      <path
        d={linePath(pts)}
        fill="none"
        style={{ stroke: TREND_COLOR[trend] }}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
