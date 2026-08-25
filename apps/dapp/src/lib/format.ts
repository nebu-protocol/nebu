const usd0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** 120000 -> "$120,000"; 9650.5 -> "$9,650.50" */
export function fmtUsdc(v: number): string {
  return `$${Number.isInteger(v) ? usd0.format(v) : usd2.format(v)}`;
}

/** 137.48 -> "137.48", 1234.5 -> "1,234.50" — chart tick/tooltip amounts. */
export function fmtPrice(v: number): string {
  return Number.isFinite(v) ? usd2.format(v) : "—";
}

/** 8.416 -> "8.42%" */
export function fmtPct(v: number): string {
  return `${v.toFixed(2)}%`;
}

/** 350 -> "3.50%" */
export function fmtBps(bps: number): string {
  return fmtPct(bps / 100);
}

/** "2026-10-30" -> "Oct 30, 2026" */
export function fmtDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** "2026-06-28T09:14:22Z" -> "Jun 28, 2026, 09:14 UTC" */
export function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dateFmt.format(d)}, ${hh}:${mm} UTC`;
}

export function truncateAddress(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 5)}...${addr.slice(-4)}`;
}

/** "8f43...7aa4" for long hex digests. */
export function truncateHash(hash: string): string {
  return hash.length <= 16 ? hash : `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export type Trend = "up" | "down" | "flat";

// CSS tokens from globals.css — one source of truth for the trend palette.
// Consumers must apply these via style properties (SVG attributes don't
// resolve var()).
export const TREND_COLOR: Record<Trend, string> = {
  up: "var(--color-pos)",
  down: "var(--color-neg)",
  flat: "var(--color-faint)", // AA-contrast gray for small mono text
};
export const TREND_FILL: Record<Trend, string> = {
  up: "#1DA66A",
  down: "#E5484D",
  flat: "#9CA1A6",
};
