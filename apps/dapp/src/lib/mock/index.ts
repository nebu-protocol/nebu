import {
  accretionSeries,
  CHART_POINTS,
  fundingProgressSeries,
  type SeriesPoint,
  SPARK_POINTS,
} from "../charts";
import { BONDS, HOLDINGS, MY_ISSUER } from "./data";
import type { BondStatus, InvoiceBond, OpenAsk } from "./types";

export type {
  BondStatus,
  HcsEvent,
  HcsEventKind,
  Holding,
  InvoiceBond,
  LiveBondRefs,
  LivePurchase,
  OpenAsk,
} from "./types";
export { BONDS, HOLDINGS, MY_ISSUER };

const MS_PER_DAY = 86_400_000;

/** Days between issue and maturity (at least 1 — live demo bonds mature in minutes). */
export function tenorDays(bond: InvoiceBond): number {
  return Math.max(
    Math.round((Date.parse(bond.maturityDate) - Date.parse(bond.issueDate)) / MS_PER_DAY),
    1,
  );
}

export function daysToMaturity(bond: InvoiceBond): number {
  return Math.ceil((Date.parse(bond.maturityDate) - Date.now()) / MS_PER_DAY);
}

/** Price paid per 1 USDC of face value (e.g. 350 bps -> 0.965). */
export function pricePerFace(bond: InvoiceBond): number {
  return 1 - bond.discountBps / 10_000;
}

/**
 * Simple annualized yield implied by the discount: buy at (1-d), receive 1
 * at maturity, scaled to 365 days. Good enough for a marketplace display.
 */
export function impliedApyPct(bond: InvoiceBond): number {
  const d = bond.discountBps / 10_000;
  return (d / (1 - d)) * (365 / tenorDays(bond)) * 100;
}

const MICRO = 1e6;

/**
 * Linear accreted carrying value per unit in µUSDC: issue price at listing
 * accreting to 1 USDC face at maturity. Default price for secondary asks.
 */
export function accretedUnitPriceMicro(bond: InvoiceBond, nowMs = Date.now()): bigint {
  const start = bond.live ? Number(bond.live.pricePerUnit) : pricePerFace(bond) * MICRO;
  const list = Date.parse(bond.issueDate);
  const maturity = Date.parse(bond.maturityDate);
  const t = maturity > list ? Math.min(Math.max((nowMs - list) / (maturity - list), 0), 1) : 1;
  return BigInt(Math.round(start + (MICRO - start) * t));
}

/**
 * Annualized yield of buying at `priceMicro` per unit and receiving 1 USDC
 * face at maturity (negative when the ask is above face).
 */
export function askYtmPct(priceMicro: bigint, bond: InvoiceBond): number {
  const p = Number(priceMicro);
  if (p <= 0) {
    return 0;
  }
  const days = Math.max(daysToMaturity(bond), 1);
  return ((MICRO - p) / p) * (365 / days) * 100;
}

const DEMO_ASK_SELLERS = [
  "0x8Ba1f109551bD432803012645Ac136ddd64DBA72",
  "0x2546BcD3c84621e976D8185a91A922aE77ECEc30",
  "0xbDA5747bFD65F08deb54cb465eB87D40e51B197E",
] as const;
const DEMO_ASK_SIZES = [0.02, 0.05, 0.03] as const;
const DEMO_ASK_BUMPS = [0.997, 1.004, 1.012] as const;

/**
 * Deterministic demo order book: 2-3 asks per tradable fixture bond, sized
 * off the face value and priced around the issue price (SSR-safe: no clock).
 */
export function demoAsks(bond: InvoiceBond): OpenAsk[] {
  if (bond.live || (bond.status !== "open" && bond.status !== "funded")) {
    return [];
  }
  const base = pricePerFace(bond) * MICRO;
  const count = 2 + (bond.id.charCodeAt(bond.id.length - 1) % 2);
  return Array.from({ length: count }, (_, i) => ({
    askId: BigInt(i + 1),
    seller: DEMO_ASK_SELLERS[i],
    unitsRemaining: BigInt(Math.max(Math.round(bond.faceValueUsdc * DEMO_ASK_SIZES[i]), 1)),
    pricePerUnit: BigInt(Math.round(base * DEMO_ASK_BUMPS[i])),
    createdAt: bond.issueDate,
  }));
}

// ponytail: pct parsed from mock event text; real chain wiring should carry
// a numeric cumulative-funded field on investment events instead.
const FUNDED_PCT_RE = /\((\d+)%\)/;

/**
 * Real fills as (timestamp, cumulative funded %), oldest first: live
 * PrimaryPurchase logs, or the mock fixtures' investment events.
 */
function fundingFills(bond: InvoiceBond): { timestamp: number; cumulativePct: number }[] {
  if (bond.live) {
    const { purchases, totalUnits } = bond.live;
    if (totalUnits === 0n) {
      return [];
    }
    let sold = 0n;
    return purchases.map((p) => {
      sold += p.units;
      return {
        timestamp: Date.parse(p.timestamp),
        cumulativePct: (Number(sold) / Number(totalUnits)) * 100,
      };
    });
  }
  return bond.events
    .filter((e) => e.kind === "investment")
    .flatMap((e) => {
      const pct = Number(FUNDED_PCT_RE.exec(e.detail)?.[1]);
      return Number.isFinite(pct)
        ? [{ timestamp: Date.parse(e.timestamp), cumulativePct: pct }]
        : [];
    });
}

/** Target raise in USDC: units × price live, face − discount otherwise. */
export function targetUsdc(bond: InvoiceBond): number {
  if (bond.live) {
    return Number(bond.live.totalUnits * bond.live.pricePerUnit) / 1e6;
  }
  return bond.faceValueUsdc * pricePerFace(bond);
}

/**
 * Zero-coupon carrying value of the whole issue (issue price accreting
 * linearly to face) sampled across [fromMs, toMs]; the window start clamps
 * to the listing timestamp, so ALL-range callers can pass -Infinity.
 */
export function accretionHistory(
  bond: InvoiceBond,
  fromMs: number,
  toMs: number,
  n = CHART_POINTS,
): SeriesPoint[] {
  const list = Date.parse(bond.issueDate);
  const from = Math.max(fromMs, list);
  // A just-listed bond still gets a real (near-flat) minute of accretion.
  const to = Math.max(toMs, from + 60_000);
  return accretionSeries(
    targetUsdc(bond),
    bond.faceValueUsdc,
    list,
    Date.parse(bond.maturityDate),
    from,
    to,
    n,
  );
}

/**
 * Card sparkline: the cumulative funding curve when the bond has at least
 * two real fills, otherwise the accretion curve — always a computed series.
 */
export function sparklineSeries(bond: InvoiceBond, nowMs = Date.now()): number[] {
  const fills = fundingFills(bond);
  if (fills.length >= 2) {
    const curve = fundingProgressSeries(Date.parse(bond.issueDate), fills);
    return [...curve.map((p) => p.value), bond.fundedPct];
  }
  return accretionHistory(bond, Number.NEGATIVE_INFINITY, nowMs, SPARK_POINTS).map((p) => p.value);
}

export type BondSort = "apy" | "maturity" | "size" | "newest";

export function getBond(id: string): InvoiceBond | undefined {
  return BONDS.find((b) => b.id === id);
}

/** Marketplace filter/sort over any bond source; pending bonds are never listed. */
export function filterBonds(
  source: InvoiceBond[],
  opts: {
    q?: string;
    status?: BondStatus | "all";
    sort?: BondSort;
  },
): InvoiceBond[] {
  const q = (opts.q ?? "").trim().toLowerCase();
  let bonds = source.filter((b) => b.status !== "pending");
  if (opts.status && opts.status !== "all") {
    bonds = bonds.filter((b) => b.status === opts.status);
  }
  if (q) {
    bonds = bonds.filter(
      (b) =>
        b.issuer.toLowerCase().includes(q) || b.payor.toLowerCase().includes(q) || b.id.includes(q),
    );
  }
  const sorted = [...bonds];
  switch (opts.sort) {
    case "maturity":
      sorted.sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));
      break;
    case "size":
      sorted.sort((a, b) => b.faceValueUsdc - a.faceValueUsdc);
      break;
    case "newest":
      sorted.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
      break;
    default:
      sorted.sort((a, b) => impliedApyPct(b) - impliedApyPct(a));
  }
  return sorted;
}

/** Issuer dashboard scope: everything MY_ISSUER has submitted. */
export function listMyInvoices(): InvoiceBond[] {
  return BONDS.filter((b) => b.issuer === MY_ISSUER);
}
