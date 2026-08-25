// Domain types for Sowee invoice bonds. The mock dataset in ./data.ts and the
// live Hedera reads in ../live both produce these shapes.

import type { Address, Hex } from "viem";
import type { Sector } from "@/lib/identity";

export type BondStatus =
  | "pending" // submitted by the issuer, not yet listed
  | "open" // primary funding in progress
  | "funded" // fully funded, tradable on the secondary market
  | "matured" // due date reached, settlement claimable
  | "settled"; // payor repaid, holders paid out

export type HcsEventKind =
  | "invoice_submitted"
  | "document_hashed"
  | "compliance_verified"
  | "bond_issued"
  | "investment"
  | "secondary_trade"
  | "maturity_reached"
  | "settlement";

/** One consensus message on the bond's HCS audit topic. */
export type HcsEvent = {
  /** HCS sequence number within the topic. */
  sequence: number;
  kind: HcsEventKind;
  /** ISO 8601 consensus timestamp. */
  timestamp: string;
  detail: string;
};

/** One primary fill, oldest first. */
export type LivePurchase = {
  buyer: Address;
  units: bigint;
  cost: bigint;
  /** ISO 8601 consensus timestamp. */
  timestamp: string;
};

/** An open secondary-market ask (units escrowed in the InvoiceMarket). */
export type OpenAsk = {
  askId: bigint;
  seller: Address;
  unitsRemaining: bigint;
  /** USDC base units (6 decimals) per bond unit. */
  pricePerUnit: bigint;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
};

/** On-chain references, present only on bonds loaded live from Hedera. */
export type LiveBondRefs = {
  invoiceId: Hex;
  bond: Address;
  issuerAddress: Address;
  /** USDC base units (6 decimals) per bond unit, fixed at listing. */
  pricePerUnit: bigint;
  totalUnits: bigint;
  unitsRemaining: bigint;
  /** MaturitySettlement state. */
  repayment: bigint;
  supplySnapshot: bigint;
  settled: boolean;
  purchases: LivePurchase[];
  /** Open secondary-market asks for this bond. */
  asks: OpenAsk[];
  /** Go API invoice uuid, when the API knows this invoice (fresh quotes). */
  apiUuid?: string;
};

export type InvoiceBond = {
  /** URL slug: mock id ("inv-0004") or live bytes32 invoiceId ("0x..."). */
  id: string;
  /** Company that tokenized the unpaid invoice. */
  issuer: string;
  /** Debtor who owes the invoice at maturity. */
  payor: string;
  /** Industry vertical, when known. */
  sector?: Sector;
  /** USDC repaid to holders at maturity (per full invoice). */
  faceValueUsdc: number;
  /** Discount off face value at issuance, in basis points. */
  discountBps: number;
  issueDate: string;
  maturityDate: string;
  /** Primary funding progress, 0-100. */
  fundedPct: number;
  status: BondStatus;
  /** SHA-256 of the underlying invoice document. */
  documentSha256: string;
  /** Hedera Consensus Service topic carrying the audit trail. */
  hcsTopicId: string;
  events: HcsEvent[];
  /** Set when loaded from the live chain; absent on demo fixtures. */
  live?: LiveBondRefs;
};

/** An investor position in one bond. */
export type Holding = {
  bondId: string;
  /** Face value held (USDC repaid at maturity). */
  faceUsdc: number;
  /** USDC paid to acquire the position. */
  costUsdc: number;
  acquiredDate: string;
};
