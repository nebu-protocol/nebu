// Optional subgraph read path. When NEXT_PUBLIC_SUBGRAPH_URL points at the
// self-hosted graph-node (see subgraph/ in the monorepo), one GraphQL query
// replaces the market + oracle mirror-node log scans. Unset or failing, the
// caller falls back to the mirror node — zero behavior change.

import type { Address, Hex } from "viem";
import type { LivePurchase, OpenAsk } from "@/lib/mock";

export const SUBGRAPH_URL = process.env.NEXT_PUBLIC_SUBGRAPH_URL || "";

export interface Listing {
  invoiceId: Hex;
  issuer: Address;
  bond: Address;
  totalUnits: bigint;
  pricePerUnit: bigint;
  maturity: bigint;
  timestamp: string;
}

export interface QuoteInfo {
  faceValue: bigint;
  discountRateBps: number;
}

export type MarketPurchase = LivePurchase & { invoiceId: Hex };

export type MarketAsk = OpenAsk & { invoiceId: Hex };

export interface MarketData {
  listings: Listing[];
  purchases: MarketPurchase[];
  /** Open asks only (filled/cancelled ones are dropped). */
  asks: MarketAsk[];
  quotes: Map<string, QuoteInfo>;
}

interface GqlAsk {
  askId: string;
  seller: string;
  unitsRemaining: string;
  pricePerUnit: string;
  cancelled: boolean;
  createdAt: string;
}

interface GqlInvoice {
  id: string;
  issuer: string;
  bond: string;
  totalUnits: string;
  pricePerUnit: string;
  maturity: string;
  listedAt: string;
  quote: { faceValue: string; discountRateBps: number } | null;
  purchases: { buyer: string; units: string; cost: string; timestamp: string }[];
  asks: GqlAsk[];
}

const QUERY = `{
  invoices(orderBy: listedAt, orderDirection: desc, first: 100) {
    id issuer bond totalUnits pricePerUnit maturity listedAt
    quote { faceValue discountRateBps }
    purchases(orderBy: timestamp, orderDirection: desc) { buyer units cost timestamp }
    asks(orderBy: pricePerUnit, first: 100) { askId seller unitsRemaining pricePerUnit cancelled createdAt }
  }
}`;

/** Subgraph unix-seconds string to ISO 8601 (mirrorTsToIso equivalent). */
const toIso = (seconds: string): string => new Date(Number(seconds) * 1000).toISOString();

/** All listings, purchases, and latest quotes in one GraphQL round-trip. */
export async function fetchSubgraphMarket(): Promise<MarketData> {
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) {
    throw new Error(`Subgraph request failed (${res.status})`);
  }
  const body = (await res.json()) as { data?: { invoices?: GqlInvoice[] } };
  const invoices = body.data?.invoices;
  if (!invoices) {
    throw new Error("Subgraph returned no data");
  }
  const listings: Listing[] = [];
  const purchases: MarketPurchase[] = [];
  const asks: MarketAsk[] = [];
  const quotes = new Map<string, QuoteInfo>();
  for (const inv of invoices) {
    const invoiceId = inv.id as Hex;
    listings.push({
      invoiceId,
      issuer: inv.issuer as Address,
      bond: inv.bond as Address,
      totalUnits: BigInt(inv.totalUnits),
      pricePerUnit: BigInt(inv.pricePerUnit),
      maturity: BigInt(inv.maturity),
      timestamp: toIso(inv.listedAt),
    });
    if (inv.quote) {
      quotes.set(invoiceId.toLowerCase(), {
        faceValue: BigInt(inv.quote.faceValue),
        discountRateBps: inv.quote.discountRateBps,
      });
    }
    for (const p of inv.purchases) {
      purchases.push({
        invoiceId,
        buyer: p.buyer as Address,
        units: BigInt(p.units),
        cost: BigInt(p.cost),
        timestamp: toIso(p.timestamp),
      });
    }
    for (const a of inv.asks) {
      const unitsRemaining = BigInt(a.unitsRemaining);
      if (a.cancelled || unitsRemaining === 0n) {
        continue;
      }
      asks.push({
        invoiceId,
        askId: BigInt(a.askId),
        seller: a.seller as Address,
        unitsRemaining,
        pricePerUnit: BigInt(a.pricePerUnit),
        createdAt: toIso(a.createdAt),
      });
    }
  }
  return { listings, purchases, asks, quotes };
}
