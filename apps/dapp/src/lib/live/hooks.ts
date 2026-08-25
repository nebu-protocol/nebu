"use client";

// react-query hooks over the live Hedera testnet deployment. With
// NEXT_PUBLIC_DEMO_DATA=1 they serve the labeled mock fixtures instead.

import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import {
  type Address,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  erc20Abi,
  type Hex,
  zeroAddress,
} from "viem";
import { truncateAddress, truncateHash } from "@/lib/format";
import { SEEDED_IDENTITIES } from "@/lib/identity";
import {
  BONDS,
  type BondStatus,
  type HcsEvent,
  type HcsEventKind,
  type InvoiceBond,
  type LivePurchase,
  type OpenAsk,
} from "@/lib/mock";
import {
  type ApiInvoice,
  DEMO_DATA,
  fetchApiInvoices,
  fetchContractLogs,
  fetchTopicMessages,
  fetchUsdcStatus,
  HCS_TOPIC_ID,
  invoiceMarketAbi,
  MARKET,
  type MirrorLog,
  maturitySettlementAbi,
  mirrorCall,
  mirrorTsToIso,
  ORACLE,
  quoteConsumedAbi,
  SETTLEMENT,
  type UsdcStatus,
} from "./chain";
import {
  fetchSubgraphMarket,
  type Listing,
  type MarketAsk,
  type MarketData,
  type MarketPurchase,
  type QuoteInfo,
  SUBGRAPH_URL,
} from "./subgraph";

// ------------------------------------------------------------ log decoding

/** AskCreated event; current units/price come from the asks(askId) state read. */
type AskEvent = { askId: bigint; invoiceId: Hex; timestamp: string };

function decodeMarketLogs(logs: MirrorLog[]): {
  listings: Listing[];
  purchases: MarketPurchase[];
  askEvents: AskEvent[];
} {
  const listings: Listing[] = [];
  const purchases: MarketPurchase[] = [];
  const askEvents: AskEvent[] = [];
  for (const log of logs) {
    try {
      const ev = decodeEventLog({
        abi: invoiceMarketAbi,
        data: (log.data ?? "0x") as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (ev.eventName === "InvoiceListed") {
        listings.push({ ...ev.args, timestamp: mirrorTsToIso(log.timestamp) });
      } else if (ev.eventName === "PrimaryPurchase") {
        purchases.push({
          invoiceId: ev.args.invoiceId,
          buyer: ev.args.buyer,
          units: ev.args.units,
          cost: ev.args.cost,
          timestamp: mirrorTsToIso(log.timestamp),
        });
      } else if (ev.eventName === "AskCreated") {
        askEvents.push({
          askId: ev.args.askId,
          invoiceId: ev.args.invoiceId,
          timestamp: mirrorTsToIso(log.timestamp),
        });
      }
    } catch {
      // Not one of the events this dapp renders (fills, cancels, admin events).
    }
  }
  return { listings, purchases, askEvents };
}

/** Latest QuoteConsumed per invoiceId (logs arrive newest first). */
function decodeQuoteLogs(logs: MirrorLog[]): Map<string, QuoteInfo> {
  const quotes = new Map<string, QuoteInfo>();
  for (const log of logs) {
    try {
      const ev = decodeEventLog({
        abi: quoteConsumedAbi,
        data: (log.data ?? "0x") as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      const key = ev.args.invoiceId.toLowerCase();
      if (!quotes.has(key)) {
        quotes.set(key, {
          faceValue: ev.args.faceValue,
          discountRateBps: ev.args.discountRateBps,
        });
      }
    } catch {
      // SignerRotated etc.
    }
  }
  return quotes;
}

// ------------------------------------------------------------ state reads

async function readInvoiceState(invoiceId: Hex) {
  const data = await mirrorCall(
    MARKET,
    encodeFunctionData({ abi: invoiceMarketAbi, functionName: "invoices", args: [invoiceId] }),
  );
  const [, , , pricePerUnit, unitsRemaining, exists] = decodeFunctionResult({
    abi: invoiceMarketAbi,
    functionName: "invoices",
    data,
  });
  return { pricePerUnit, unitsRemaining, exists };
}

/** asks(askId) getter; a deleted (filled/cancelled) ask returns the zero seller. */
async function readAskState(askId: bigint) {
  const data = await mirrorCall(
    MARKET,
    encodeFunctionData({ abi: invoiceMarketAbi, functionName: "asks", args: [askId] }),
  );
  const [seller, , unitsRemaining, pricePerUnit] = decodeFunctionResult({
    abi: invoiceMarketAbi,
    functionName: "asks",
    data,
  });
  return { seller, unitsRemaining, pricePerUnit };
}

async function readSettlementState(invoiceId: Hex) {
  const data = await mirrorCall(
    SETTLEMENT,
    encodeFunctionData({
      abi: maturitySettlementAbi,
      functionName: "settlements",
      args: [invoiceId],
    }),
  );
  const [, , repayment, , supplySnapshot, , settled] = decodeFunctionResult({
    abi: maturitySettlementAbi,
    functionName: "settlements",
    data,
  });
  return { repayment, supplySnapshot, settled };
}

/** ERC-20 balance of an ATS bond via a mirror-node eth_call. */
export async function readBondBalance(bond: Address, owner: Address): Promise<bigint> {
  const data = await mirrorCall(
    bond,
    encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
  );
  return decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data });
}

// ------------------------------------------------------------- assembly

const MICRO = 1e6;

function toBond(
  listing: Listing,
  purchases: LivePurchase[],
  asks: OpenAsk[],
  quote: QuoteInfo | undefined,
  inv: { pricePerUnit: bigint; unitsRemaining: bigint },
  settle: { repayment: bigint; supplySnapshot: bigint; settled: boolean },
  api: ApiInvoice | undefined,
): InvoiceBond {
  const { totalUnits } = listing;
  const soldPct =
    totalUnits > 0n ? (Number(totalUnits - inv.unitsRemaining) / Number(totalUnits)) * 100 : 0;
  const faceValueUsdc = quote
    ? Number(quote.faceValue) / MICRO
    : Number(totalUnits * listing.pricePerUnit) / MICRO;
  const maturityMs = Number(listing.maturity) * 1000;
  const status: BondStatus = settle.settled
    ? "settled"
    : Date.now() >= maturityMs
      ? "matured"
      : inv.unitsRemaining === 0n
        ? "funded"
        : "open";
  // Issuer/payor names live neither on-chain (generic bond names) nor in the
  // quote API — the seeder's curated identities are mapped by invoiceId.
  const identity = SEEDED_IDENTITIES[listing.invoiceId];
  return {
    id: listing.invoiceId,
    issuer: identity?.issuer ?? truncateAddress(listing.issuer),
    payor: identity?.payor ?? (api ? truncateAddress(api.payor) : "Unknown payor"),
    sector: identity?.sector,
    faceValueUsdc,
    discountBps: quote?.discountRateBps ?? 0,
    // Full listing timestamp: accretion charts need intraday precision
    // (seeded demo bonds mature within minutes of listing).
    issueDate: listing.timestamp,
    maturityDate: new Date(maturityMs).toISOString(),
    fundedPct: Math.round(soldPct),
    status,
    documentSha256: api?.docHash ?? "",
    hcsTopicId: HCS_TOPIC_ID,
    events: [],
    live: {
      invoiceId: listing.invoiceId,
      bond: listing.bond,
      issuerAddress: listing.issuer,
      pricePerUnit: inv.pricePerUnit > 0n ? inv.pricePerUnit : listing.pricePerUnit,
      totalUnits,
      unitsRemaining: inv.unitsRemaining,
      repayment: settle.repayment,
      supplySnapshot: settle.supplySnapshot,
      settled: settle.settled,
      purchases,
      asks,
      apiUuid: api?.id,
    },
  };
}

/** Market events from the mirror node (the always-available path). */
async function fetchMirrorMarket(): Promise<MarketData> {
  const [marketLogs, oracleLogs] = await Promise.all([
    fetchContractLogs(MARKET),
    fetchContractLogs(ORACLE),
  ]);
  const { listings, purchases, askEvents } = decodeMarketLogs(marketLogs);
  // AskCreated gives id/invoice/time; asks(askId) gives what is still open.
  const askStates = await Promise.all(
    askEvents.map(async (ev) => ({ ev, state: await readAskState(ev.askId) })),
  );
  const asks: MarketAsk[] = askStates
    .filter(({ state }) => state.seller !== zeroAddress && state.unitsRemaining > 0n)
    .map(({ ev, state }) => ({
      askId: ev.askId,
      invoiceId: ev.invoiceId,
      seller: state.seller,
      unitsRemaining: state.unitsRemaining,
      pricePerUnit: state.pricePerUnit,
      createdAt: ev.timestamp,
    }));
  return { listings, purchases, asks, quotes: decodeQuoteLogs(oracleLogs) };
}

/** Subgraph when NEXT_PUBLIC_SUBGRAPH_URL is set, mirror node otherwise or on error. */
async function fetchMarketData(): Promise<MarketData> {
  if (SUBGRAPH_URL) {
    try {
      return await fetchSubgraphMarket();
    } catch {
      // graph-node down or unsynced — the mirror node remains the source of truth.
    }
  }
  return fetchMirrorMarket();
}

/** All listed invoices, composed from market/oracle events + contract state. */
export async function fetchLiveBonds(): Promise<InvoiceBond[]> {
  const [{ listings, purchases, asks, quotes }, apiInvoices] = await Promise.all([
    fetchMarketData(),
    fetchApiInvoices(),
  ]);
  return await Promise.all(
    listings.map(async (listing) => {
      const key = listing.invoiceId.toLowerCase();
      const [inv, settle] = await Promise.all([
        readInvoiceState(listing.invoiceId),
        readSettlementState(listing.invoiceId),
      ]);
      const mine = purchases.filter((p) => p.invoiceId.toLowerCase() === key).reverse();
      const open = asks.filter((a) => a.invoiceId.toLowerCase() === key);
      const api = apiInvoices.find((a) => a.invoiceId.toLowerCase() === key);
      return toBond(listing, mine, open, quotes.get(key), inv, settle, api);
    }),
  );
}

// --------------------------------------------------------------- hooks

const LISTED_MOCKS = BONDS.filter((b) => b.status !== "pending");

/** Marketplace bonds: live from the mirror node, or mock fixtures in demo mode. */
export function useBonds(): UseQueryResult<InvoiceBond[]> {
  return useQuery({
    queryKey: ["bonds"],
    queryFn: DEMO_DATA ? () => Promise.resolve(LISTED_MOCKS) : fetchLiveBonds,
    refetchInterval: DEMO_DATA ? false : 30_000,
  });
}

const HCS_EVENT_KIND: Record<string, HcsEventKind> = {
  issued: "bond_issued",
  verified: "compliance_verified",
  funded: "investment",
  traded: "secondary_trade",
  settled: "settlement",
};

async function fetchAuditTrail(topicId: string, invoiceId: string): Promise<HcsEvent[]> {
  const messages = await fetchTopicMessages(topicId);
  const events: HcsEvent[] = [];
  for (const m of messages) {
    try {
      const parsed = JSON.parse(m.message) as {
        invoiceId?: string;
        event?: string;
        docHash?: string;
      };
      if (parsed.invoiceId?.toLowerCase() !== invoiceId.toLowerCase()) {
        continue;
      }
      events.push({
        sequence: m.sequence_number,
        kind: HCS_EVENT_KIND[parsed.event ?? ""] ?? "invoice_submitted",
        timestamp: mirrorTsToIso(m.consensus_timestamp),
        detail: `Attested "${parsed.event}" — doc sha256 ${truncateHash(parsed.docHash ?? "")}`,
      });
    } catch {
      // Non-attestation message on the shared topic.
    }
  }
  return events;
}

/** Real HCS consensus messages for a live bond (demo bonds keep their fixtures). */
export function useAuditTrail(bond: InvoiceBond): UseQueryResult<HcsEvent[]> {
  return useQuery({
    queryKey: ["audit", bond.hcsTopicId, bond.id],
    enabled: !DEMO_DATA && Boolean(bond.live),
    refetchInterval: 30_000,
    queryFn: () => fetchAuditTrail(bond.hcsTopicId, bond.id),
  });
}

/** Connected wallet's unit balance of one live bond (gates the sell panel). */
export function useBondBalance(
  bond: InvoiceBond,
  address: string | undefined,
): UseQueryResult<bigint> {
  const token = bond.live?.bond;
  return useQuery({
    queryKey: ["bondBalance", token, address],
    enabled: !DEMO_DATA && Boolean(token) && Boolean(address),
    refetchInterval: 30_000,
    queryFn: () => readBondBalance(token ?? zeroAddress, (address ?? zeroAddress) as Address),
  });
}

/** USDC association/KYC/balance for the connected wallet. */
export function useUsdcStatus(address: string | undefined): UseQueryResult<UsdcStatus> {
  return useQuery({
    queryKey: ["usdc", address],
    enabled: !DEMO_DATA && Boolean(address),
    refetchInterval: 30_000,
    queryFn: () => fetchUsdcStatus(address ?? ""),
  });
}

export interface LivePosition {
  bond: InvoiceBond;
  units: bigint;
  /** ponytail: cost basis = sum of this wallet's primary fills; secondary trades not netted. */
  costUsdc: number;
  faceUsdc: number;
  /** Pro-rata payout available now (settled invoices only). */
  claimableUsdc: number;
  acquiredDate?: string;
}

async function fetchPortfolio(address: Address): Promise<LivePosition[]> {
  const bonds = await fetchLiveBonds();
  const rows = await Promise.all(
    bonds.map(async (bond): Promise<LivePosition | null> => {
      const live = bond.live;
      if (!live) {
        return null;
      }
      const units = await readBondBalance(live.bond, address);
      if (units === 0n) {
        return null;
      }
      const mine = live.purchases.filter((p) => p.buyer.toLowerCase() === address.toLowerCase());
      const costUsdc = Number(mine.reduce((sum, p) => sum + p.cost, 0n)) / MICRO;
      const faceUsdc =
        live.totalUnits > 0n ? (Number(units) / Number(live.totalUnits)) * bond.faceValueUsdc : 0;
      const claimableUsdc =
        live.settled && live.supplySnapshot > 0n
          ? Number((live.repayment * units) / live.supplySnapshot) / MICRO
          : 0;
      return { bond, units, costUsdc, faceUsdc, claimableUsdc, acquiredDate: mine[0]?.timestamp };
    }),
  );
  return rows.filter((r): r is LivePosition => r !== null);
}

/** Live bond positions + claimable settlements for the connected wallet. */
export function usePortfolio(address: string | undefined): UseQueryResult<LivePosition[]> {
  return useQuery({
    queryKey: ["portfolio", address],
    enabled: !DEMO_DATA && Boolean(address),
    refetchInterval: 30_000,
    queryFn: () => fetchPortfolio((address ?? "0x") as Address),
  });
}
