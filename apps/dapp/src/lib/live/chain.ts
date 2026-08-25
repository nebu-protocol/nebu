// Live Hedera testnet wiring: network constants, contract ABIs, Mirror Node
// REST helpers, and the Go quote API client. Client-safe (fetch + atob only).

import { HEDERA_TESTNET, SOWEE_TESTNET, USDC_TESTNET } from "@sowee/core";
import {
  type Address,
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  type Hex,
  http,
} from "viem";
import { hederaTestnet } from "viem/chains";

/** `NEXT_PUBLIC_DEMO_DATA=1` renders the labeled mock fixtures instead of live reads. */
export const DEMO_DATA = process.env.NEXT_PUBLIC_DEMO_DATA === "1";

export const CHAIN_ID = HEDERA_TESTNET.chainId;
export const RPC_URL = HEDERA_TESTNET.rpcUrl;
export const MIRROR_URL = HEDERA_TESTNET.mirrorNodeUrl;
export const EXPLORER_URL = HEDERA_TESTNET.explorerUrl;
export const MARKET = SOWEE_TESTNET.invoiceMarket;
export const ORACLE = SOWEE_TESTNET.discountOracle;
export const SETTLEMENT = SOWEE_TESTNET.maturitySettlement;
export const USDC = USDC_TESTNET.evmAddress;
export const USDC_TOKEN_ID = USDC_TESTNET.tokenId;

/** Shared HCS audit-trail topic (all invoices attest to one topic). */
export const HCS_TOPIC_ID = process.env.NEXT_PUBLIC_HCS_TOPIC_ID || "0.0.10206435";

const TRAILING_SLASH = /\/$/;
export const API_URL = (process.env.NEXT_PUBLIC_SOWEE_API_URL || "http://localhost:8080").replace(
  TRAILING_SLASH,
  "",
);

/** JSON-RPC client (Hashio) for tx simulation and receipts. */
export const publicClient = createPublicClient({
  chain: hederaTestnet,
  transport: http(RPC_URL),
});

export const txLink = (hash: string): string => `${EXPLORER_URL}/transaction/${hash}`;

// ------------------------------------------------------------------- ABIs
// Copied from scripts/e2e/src/abi.ts (proven against the live deployment),
// plus the events and PegGuard errors the dapp decodes.

/** DiscountOracle.Quote as a viem tuple component list. */
const quoteComponents = [
  { name: "invoiceId", type: "bytes32" },
  { name: "faceValue", type: "uint256" },
  { name: "discountRateBps", type: "uint16" },
  { name: "validUntil", type: "uint64" },
  { name: "nonce", type: "uint64" },
] as const;

export const invoiceMarketAbi = [
  {
    type: "function",
    name: "listInvoice",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "bond", type: "address" },
      { name: "totalUnits", type: "uint256" },
      { name: "maturity", type: "uint64" },
      { name: "quote", type: "tuple", components: quoteComponents },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyPrimary",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "units", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "makeAsk",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "units", type: "uint256" },
      { name: "pricePerUnit", type: "uint256" },
    ],
    outputs: [{ name: "askId", type: "uint256" }],
  },
  {
    type: "function",
    name: "fillAsk",
    stateMutability: "nonpayable",
    inputs: [
      { name: "askId", type: "uint256" },
      { name: "units", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelAsk",
    stateMutability: "nonpayable",
    inputs: [{ name: "askId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "asks",
    stateMutability: "view",
    inputs: [{ name: "askId", type: "uint256" }],
    outputs: [
      { name: "seller", type: "address" },
      { name: "invoiceId", type: "bytes32" },
      { name: "unitsRemaining", type: "uint256" },
      { name: "pricePerUnit", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "invoices",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [
      { name: "issuer", type: "address" },
      { name: "bond", type: "address" },
      { name: "maturity", type: "uint64" },
      { name: "pricePerUnit", type: "uint256" },
      { name: "unitsRemaining", type: "uint256" },
      { name: "exists", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "InvoiceListed",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "issuer", type: "address", indexed: true },
      { name: "bond", type: "address", indexed: true },
      { name: "totalUnits", type: "uint256", indexed: false },
      { name: "pricePerUnit", type: "uint256", indexed: false },
      { name: "maturity", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PrimaryPurchase",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "units", type: "uint256", indexed: false },
      { name: "cost", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AskCreated",
    inputs: [
      { name: "askId", type: "uint256", indexed: true },
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "seller", type: "address", indexed: true },
      { name: "units", type: "uint256", indexed: false },
      { name: "pricePerUnit", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AskFilled",
    inputs: [
      { name: "askId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "units", type: "uint256", indexed: false },
      { name: "cost", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AskCancelled",
    inputs: [
      { name: "askId", type: "uint256", indexed: true },
      { name: "unitsReturned", type: "uint256", indexed: false },
    ],
  },
  { type: "error", name: "UnknownInvoice", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  { type: "error", name: "UnknownAsk", inputs: [{ name: "askId", type: "uint256" }] },
  { type: "error", name: "NotSeller", inputs: [] },
  { type: "error", name: "InvalidParams", inputs: [] },
  {
    type: "error",
    name: "InsufficientUnits",
    inputs: [
      { name: "requested", type: "uint256" },
      { name: "available", type: "uint256" },
    ],
  },
  { type: "error", name: "InvoiceMatured", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  {
    type: "error",
    name: "QuoteExpired",
    inputs: [
      { name: "validUntil", type: "uint64" },
      { name: "nowTimestamp", type: "uint256" },
    ],
  },
  // PegGuard errors bubble up through buyPrimary's ensureHealthy() call.
  { type: "error", name: "StalePrice", inputs: [{ name: "updatedAt", type: "uint256" }] },
  { type: "error", name: "InvalidPrice", inputs: [{ name: "answer", type: "int256" }] },
  { type: "error", name: "PegDeviation", inputs: [{ name: "answer", type: "int256" }] },
  // listInvoice errors (incl. DiscountOracle.verifyQuote bubbling up).
  { type: "error", name: "AlreadyListed", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  {
    type: "error",
    name: "QuoteMismatch",
    inputs: [
      { name: "expected", type: "bytes32" },
      { name: "actual", type: "bytes32" },
    ],
  },
  { type: "error", name: "MaturityInPast", inputs: [{ name: "maturity", type: "uint64" }] },
  { type: "error", name: "PriceRoundsToZero", inputs: [] },
  { type: "error", name: "InvalidSignature", inputs: [] },
  { type: "error", name: "NonceAlreadyUsed", inputs: [{ name: "nonce", type: "uint64" }] },
] as const;

export const quoteConsumedAbi = [
  {
    type: "event",
    name: "QuoteConsumed",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "nonce", type: "uint64", indexed: true },
      { name: "faceValue", type: "uint256", indexed: false },
      { name: "discountRateBps", type: "uint16", indexed: false },
    ],
  },
] as const;

export const maturitySettlementAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settlements",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [
      { name: "bond", type: "address" },
      { name: "maturity", type: "uint64" },
      { name: "repayment", type: "uint256" },
      { name: "remaining", type: "uint256" },
      { name: "supplySnapshot", type: "uint256" },
      { name: "unitsSurrendered", type: "uint256" },
      { name: "settled", type: "bool" },
    ],
  },
  { type: "error", name: "UnknownInvoice", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  { type: "error", name: "NotSettled", inputs: [{ name: "invoiceId", type: "bytes32" }] },
  {
    type: "error",
    name: "NothingToClaim",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "holder", type: "address" },
    ],
  },
] as const;

// ---------------------------------------------------------------- mirror

async function mirrorGet<T>(path: string): Promise<T> {
  const res = await fetch(`${MIRROR_URL}/${path}`, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Mirror node request failed (${res.status}): ${path}`);
  }
  return (await res.json()) as T;
}

export interface MirrorLog {
  address: string;
  data: string | null;
  topics: string[];
  timestamp: string;
  transaction_hash: string;
}

const MIRROR_PATH_PREFIX = "/api/v1/";

/**
 * Recent EVM logs for a contract, newest first.
 * ponytail: capped at 3 pages of 100 — enough for the testnet market; add
 * timestamp-cursored paging if listings ever outgrow it.
 */
export async function fetchContractLogs(address: string): Promise<MirrorLog[]> {
  const logs: MirrorLog[] = [];
  let path = `contracts/${address}/results/logs?limit=100&order=desc`;
  for (let page = 0; page < 3 && path; page++) {
    const body = await mirrorGet<{ logs: MirrorLog[]; links?: { next: string | null } }>(path);
    logs.push(...body.logs);
    const next = body.links?.next;
    path = next?.startsWith(MIRROR_PATH_PREFIX) ? next.slice(MIRROR_PATH_PREFIX.length) : "";
  }
  return logs;
}

/** Read-only eth_call through the Mirror Node (`/contracts/call`). */
export async function mirrorCall(to: Address, data: Hex): Promise<Hex> {
  const res = await fetch(`${MIRROR_URL}/contracts/call`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ to, data, estimate: false }),
  });
  if (!res.ok) {
    throw new Error(`Mirror node contract call failed (${res.status})`);
  }
  return ((await res.json()) as { result: Hex }).result;
}

/**
 * EVM call_result of a mined transaction (undefined while the mirror node
 * still lags behind consensus). Used to read the factory's deployBond return.
 */
export async function fetchCallResult(hash: string): Promise<Hex | undefined> {
  try {
    const body = await mirrorGet<{ call_result?: string }>(`contracts/results/${hash}`);
    return body.call_result && body.call_result !== "0x" ? (body.call_result as Hex) : undefined;
  } catch {
    return undefined;
  }
}

export interface TopicMessage {
  consensus_timestamp: string;
  sequence_number: number;
  /** UTF-8 payload (Mirror Node returns base64). */
  message: string;
}

/** HCS topic messages, oldest first, payload base64-decoded. */
export async function fetchTopicMessages(topicId: string): Promise<TopicMessage[]> {
  const body = await mirrorGet<{ messages: TopicMessage[] }>(
    `topics/${topicId}/messages?limit=100&order=asc`,
  );
  return body.messages.map((m) => ({ ...m, message: atob(m.message) }));
}

export interface UsdcStatus {
  associated: boolean;
  /** False when the HTS KYC flag is revoked — transfers revert at the token layer. */
  kycGranted: boolean;
  /** Base units (6 decimals). */
  balance: bigint;
}

/** HTS token relationship for USDC: association, KYC flag, balance. */
export async function fetchUsdcStatus(address: string): Promise<UsdcStatus> {
  const body = await mirrorGet<{ tokens: { balance: number; kyc_status?: string }[] }>(
    `accounts/${address}/tokens?token.id=${USDC_TOKEN_ID}`,
  );
  const rel = body.tokens[0];
  if (!rel) {
    return { associated: false, kycGranted: false, balance: 0n };
  }
  return {
    associated: true,
    kycGranted: rel.kyc_status !== "REVOKED",
    balance: BigInt(rel.balance),
  };
}

/** Mirror consensus timestamp ("1712345678.000000123") to ISO 8601. */
export function mirrorTsToIso(ts: string): string {
  return new Date(Number.parseInt(ts, 10) * 1000).toISOString();
}

// ------------------------------------------------------------------- API

export interface ApiInvoice {
  id: string;
  invoiceId: Hex;
  payor: string;
  faceValue: string;
  dueDate: string;
  docHash: string;
}

export interface ApiQuote {
  invoiceId: Hex;
  faceValue: string;
  discountRateBps: number;
  validUntil: number;
  nonce: number;
  signature: Hex;
  signer: string;
}

/** GET /v1/invoices — empty when the API is unreachable (optional for reads). */
export async function fetchApiInvoices(): Promise<ApiInvoice[]> {
  try {
    const res = await fetch(`${API_URL}/v1/invoices`);
    if (!res.ok) {
      return [];
    }
    return ((await res.json()) as { invoices: ApiInvoice[] }).invoices ?? [];
  } catch {
    return [];
  }
}

/**
 * POST /v1/invoices — register an invoice with the Go API. Throws human
 * messages: 409 is the double-pledge guard (same document hash already
 * registered), other statuses surface the API's validation message.
 */
export async function registerApiInvoice(input: {
  /** Payor EVM address (derived from the payor name for fictional payors). */
  payor: string;
  /** Face value in USDC base units (6 decimals), as a decimal string. */
  faceValue: string;
  /** Invoice due date, ISO 8601. */
  dueDate: string;
  /** sha256 of the invoice document, 64 hex chars. */
  docHash: string;
}): Promise<ApiInvoice> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/v1/invoices`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    throw new Error(`Could not reach the Sowee API at ${API_URL} — is it running?`);
  }
  if (res.status === 409) {
    throw new Error(
      "This document is already pledged: an invoice with the same document hash is registered. Each invoice can only be tokenized once.",
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as { message?: string } | undefined;
    throw new Error(body?.message ?? `Invoice registration failed (${res.status}).`);
  }
  return (await res.json()) as ApiInvoice;
}

/** POST /v1/invoices/{uuid}/quote — a freshly signed discount quote. */
export async function fetchFreshQuote(uuid: string): Promise<ApiQuote> {
  const res = await fetch(`${API_URL}/v1/invoices/${uuid}/quote`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`Quote request failed (${res.status})`);
  }
  return (await res.json()) as ApiQuote;
}

// ---------------------------------------------------------------- errors

const PEG_MESSAGE =
  "Buying is paused: the USDC peg guard tripped (price feed stale or off peg). Try again once the feed recovers.";

const ERROR_MESSAGES: Record<string, string> = {
  StalePrice: PEG_MESSAGE,
  InvalidPrice: PEG_MESSAGE,
  PegDeviation: PEG_MESSAGE,
  InsufficientUnits: "Not enough units left in this sale — lower the amount.",
  UnknownAsk: "This ask no longer exists — it was already filled or cancelled.",
  NotSeller: "Only the seller can cancel this ask.",
  InvalidParams: "A zero amount or price was supplied — enter a positive value.",
  InvoiceMatured: "This invoice has matured; the primary sale is closed.",
  QuoteExpired: "The signed discount quote expired — request a fresh quote and retry.",
  UnknownInvoice: "This invoice is not listed on-chain.",
  NothingToClaim: "This wallet holds no bond units to claim with.",
  NotSettled: "Settlement has not run for this invoice yet.",
  AlreadyListed: "This invoice is already listed on the market.",
  QuoteMismatch: "The signed quote does not match this invoice — retry to fetch a fresh one.",
  MaturityInPast: "The due date is already in the past — submit with a later due date.",
  PriceRoundsToZero: "The discounted price rounds to zero — the face value is too small to list.",
  InvalidSignature: "The oracle rejected the quote signature — retry to fetch a fresh quote.",
  NonceAlreadyUsed: "This quote was already consumed — retry to fetch a fresh one.",
};

/** True when viem decoded an actual contract revert (vs a simulation/infra error). */
export function isDecodedRevert(err: unknown): boolean {
  return (
    err instanceof BaseError && Boolean(err.walk((e) => e instanceof ContractFunctionRevertedError))
  );
}

/** Map a viem/contract error to a short human message. */
export function humanizeTxError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName ?? "";
      const known = ERROR_MESSAGES[name];
      if (known) {
        return known;
      }
      if (name) {
        return `Transaction reverted: ${name}`;
      }
      // Data-less reverts on Hedera usually mean the HTS token layer
      // (association / KYC) rejected a transfer.
      return "The token layer rejected the transfer — check that your wallet is associated with and KYC'd for testnet USDC.";
    }
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}
