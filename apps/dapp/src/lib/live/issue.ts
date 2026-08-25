// Issuer-side issuance pipeline: the exact sequence proven by the e2e market
// seeder (scripts/e2e/src/seed.ts), driven from the connected browser wallet.
// Every step re-checks chain state before sending, so a resumed draft (page
// refresh, wallet hiccup) skips what is already done instead of re-paying it.

import {
  bootstrapCompliance,
  buildCreateInvoiceBondCall,
  factoryAbi,
  issueUnits,
  type PreparedCall,
  ROLE_CONTROL_LIST,
  ROLE_ISSUER,
  ROLE_KYC,
  ROLE_SSI_MANAGER,
} from "@sowee/plugin-ats";
import {
  type Address,
  decodeFunctionResult,
  erc20Abi,
  getAddress,
  type Hex,
  keccak256,
  stringToHex,
} from "viem";
import { truncateAddress } from "@/lib/format";
import {
  API_URL,
  type ApiQuote,
  fetchCallResult,
  fetchFreshQuote,
  invoiceMarketAbi,
  MARKET,
  publicClient,
  SETTLEMENT,
} from "./chain";
import {
  approveIfNeeded,
  connectOnHedera,
  execute,
  type GetWallet,
  type Wallet,
  waitOk,
} from "./tx";

// ------------------------------------------------------------------- drafts

/**
 * Persisted issuance progress. Fields double as step markers (the seeder's
 * design): bondTx/bondAddress/complianceDone/mintDone/listTx tell a resumed
 * run where it left off, and the chain is re-read before any send anyway.
 */
export interface IssuanceDraft {
  /** Go API invoice uuid (quotes are requested by uuid). */
  invoiceUuid: string;
  /** bytes32 on-chain invoice id, derived by the API from the uuid. */
  invoiceId: Hex;
  payorName: string;
  /** Whole USDC face value — also the number of 1-USDC bond units. */
  faceUsdc: number;
  /** Bond maturity (invoice due date), unix seconds. */
  maturity: number;
  /** sha256 of the invoice document (64 hex chars). */
  docHash: string;
  bondTx?: Hex;
  bondAddress?: Address;
  complianceDone?: boolean;
  mintDone?: boolean;
  listTx?: Hex;
  attested?: boolean;
  updatedAt: number;
}

const DRAFT_PREFIX = "sowee.issuance.";

export function saveDraft(draft: IssuanceDraft): void {
  try {
    draft.updatedAt = Date.now();
    localStorage.setItem(DRAFT_PREFIX + draft.invoiceId, JSON.stringify(draft));
  } catch {
    // Storage unavailable (private mode): the run still works, just not resumable.
  }
}

export function clearDraft(draft: IssuanceDraft): void {
  try {
    localStorage.removeItem(DRAFT_PREFIX + draft.invoiceId);
  } catch {
    // ignore
  }
}

/** Most recent unfinished draft, if any — what a refreshed /issuer/new resumes. */
export function loadUnfinishedDraft(): IssuanceDraft | undefined {
  try {
    const drafts: IssuanceDraft[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DRAFT_PREFIX)) {
        continue;
      }
      const raw = localStorage.getItem(key);
      if (!raw) {
        continue;
      }
      const draft = JSON.parse(raw) as IssuanceDraft;
      if (draft.invoiceUuid && draft.invoiceId && !draft.listTx) {
        drafts.push(draft);
      }
    }
    drafts.sort((a, b) => b.updatedAt - a.updatedAt);
    return drafts[0];
  } catch {
    return undefined;
  }
}

/**
 * Deterministic fictional EVM address for a payor name — the API requires an
 * address and no real key exists for a demo payor. Same derivation as the
 * seeder, so identical names map to identical addresses.
 */
export function deriveAddressFromName(name: string): Address {
  return getAddress(`0x${keccak256(stringToHex(name)).slice(-40)}`);
}

// -------------------------------------------------------------------- steps

export type IssuanceStepId =
  | "deploy"
  | "resolve"
  | "compliance"
  | "mint"
  | "quote"
  | "approve"
  | "list"
  | "attest";

export const ISSUANCE_STEPS: readonly { id: IssuanceStepId; title: string }[] = [
  { id: "deploy", title: "Deploy the bond token" },
  { id: "resolve", title: "Resolve the bond address" },
  { id: "compliance", title: "Bootstrap compliance" },
  { id: "mint", title: "Mint bond units" },
  { id: "quote", title: "Fetch the signed discount quote" },
  { id: "approve", title: "Approve the market" },
  { id: "list", title: "List on the market" },
  { id: "attest", title: "Anchor to the HCS audit trail" },
] as const;

export type StepUpdate = { status: "working" | "done"; label?: string; hash?: Hex };
export type OnStepUpdate = (step: IssuanceStepId, update: StepUpdate) => void;

/** Steps a stored draft has already completed (for rendering before a run). */
export function draftDoneSteps(draft: IssuanceDraft): Set<IssuanceStepId> {
  const done = new Set<IssuanceStepId>();
  if (draft.bondTx) done.add("deploy");
  if (draft.bondAddress) done.add("resolve");
  if (draft.complianceDone) done.add("compliance");
  if (draft.mintDone) done.add("mint");
  if (draft.listTx) {
    done.add("quote");
    done.add("approve");
    done.add("list");
  }
  if (draft.attested) {
    done.add("attest");
  }
  return done;
}

// ------------------------------------------------- chain reads (idempotence)

/** ATS diamond view functions — copied from scripts/e2e/src/abi.ts (proven live). */
const atsViewsAbi = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "_role", type: "bytes32" },
      { name: "_account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isIssuer",
    stateMutability: "view",
    inputs: [{ name: "_issuer", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getKycStatusFor",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "kycStatus_", type: "uint8" }],
  },
  {
    type: "function",
    name: "isInControlList",
    stateMutability: "view",
    inputs: [{ name: "_account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

async function isListed(invoiceId: Hex): Promise<boolean> {
  const listing = await publicClient.readContract({
    address: MARKET,
    abi: invoiceMarketAbi,
    functionName: "invoices",
    args: [invoiceId],
  });
  return listing[5];
}

// ------------------------------------------------------------------ sending

/** Hedera per-transaction gas ceiling (same as the seeder). */
const MAX_GAS = 15_000_000n;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Estimate (padded 20%, capped at Hedera's ceiling), prompt, send, await receipt. */
async function sendPrepared(
  wallet: Wallet,
  call: PreparedCall,
  label: string,
  step: IssuanceStepId,
  onStep: OnStepUpdate,
  onHash?: (hash: Hex) => void,
): Promise<Hex> {
  const estimated = await publicClient.estimateGas({
    account: wallet.account,
    to: call.to,
    data: call.data,
  });
  const padded = (estimated * 120n) / 100n;
  onStep(step, { status: "working", label: `${label} — confirm in your wallet…` });
  const hash = await wallet.sendTransaction({
    to: call.to,
    data: call.data,
    gas: padded > MAX_GAS ? MAX_GAS : padded,
  });
  onHash?.(hash);
  onStep(step, { status: "working", label: "Waiting for confirmation…", hash });
  await waitOk(hash, `${label} reverted on-chain.`);
  return hash;
}

// ---------------------------------------------------------------- pipeline

interface Ctx {
  wallet: Wallet;
  draft: IssuanceDraft;
  save: () => void;
  onStep: OnStepUpdate;
}

function needBond(draft: IssuanceDraft): Address {
  if (!draft.bondAddress) {
    throw new Error("Draft lost the bond address — discard the draft and start over.");
  }
  return draft.bondAddress;
}

function unitsOf(draft: IssuanceDraft): bigint {
  return BigInt(draft.faceUsdc);
}

/** True when the receipt is in and says the transaction reverted. */
async function hasReverted(hash: Hex): Promise<boolean> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash });
    return receipt.status !== "success";
  } catch {
    return false; // still pending / unknown — keep the hash, resolve will poll it
  }
}

/**
 * ATS factory deployBond with the derived Luhn-valid ISIN (plugin default).
 * The only non-idempotent step (a re-send deploys a second diamond), so the
 * tx hash is persisted the moment it leaves the wallet; a hash whose receipt
 * says "reverted" is dropped so a retry deploys cleanly.
 */
async function stepDeploy(cx: Ctx): Promise<void> {
  if (cx.draft.bondTx) {
    if (!(await hasReverted(cx.draft.bondTx))) {
      return;
    }
    cx.draft.bondTx = undefined;
    cx.save();
  }
  const call = buildCreateInvoiceBondCall({
    invoiceId: cx.draft.invoiceId,
    faceValue: unitsOf(cx.draft) * 1_000_000n,
    maturityDate: BigInt(cx.draft.maturity),
    admin: cx.wallet.account.address,
  });
  await sendPrepared(cx.wallet, call, "Bond deployment", "deploy", cx.onStep, (hash) => {
    cx.draft.bondTx = hash;
    cx.save();
  });
}

/** The factory returns the diamond address; read it from the mirror node's call_result. */
async function stepResolve(cx: Ctx): Promise<void> {
  if (cx.draft.bondAddress) {
    return;
  }
  if (!cx.draft.bondTx) {
    throw new Error("Draft lost the deploy transaction — discard the draft and start over.");
  }
  cx.onStep("resolve", { status: "working", label: "Reading the mirror node…" });
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const result = await fetchCallResult(cx.draft.bondTx);
    if (result) {
      const bond = decodeFunctionResult({
        abi: factoryAbi,
        functionName: "deployBond",
        data: result,
      });
      cx.draft.bondAddress = getAddress(bond);
      cx.save();
      return;
    }
  }
  throw new Error("The mirror node has not indexed the bond deployment yet — retry in a minute.");
}

interface ComplianceTask {
  call: PreparedCall;
  label: string;
  isDone: () => Promise<boolean>;
}

function needCall(calls: readonly PreparedCall[], i: number): PreparedCall {
  const call = calls[i];
  if (call === undefined) {
    throw new Error(`bootstrapCompliance produced no call at index ${i}`);
  }
  return call;
}

/**
 * The selfSetup compliance batch for a factory-fresh bond, one PreparedCall per
 * tx: 4 role grants + SSI issuer registration for the connected wallet, then
 * KYC + control-list for market, settlement, and the connected wallet. Call
 * order is documented by bootstrapCompliance and indexed against the checks.
 */
function complianceTasks(cx: Ctx, bond: Address): ComplianceTask[] {
  const admin = cx.wallet.account.address;
  const hasRole = (role: Hex) =>
    publicClient.readContract({
      address: bond,
      abi: atsViewsAbi,
      functionName: "hasRole",
      args: [role, admin],
    });
  const isIssuer = () =>
    publicClient.readContract({
      address: bond,
      abi: atsViewsAbi,
      functionName: "isIssuer",
      args: [admin],
    });
  const kycStatus = (account: Address) =>
    publicClient.readContract({
      address: bond,
      abi: atsViewsAbi,
      functionName: "getKycStatusFor",
      args: [account],
    });
  const inControlList = (account: Address) =>
    publicClient.readContract({
      address: bond,
      abi: atsViewsAbi,
      functionName: "isInControlList",
      args: [account],
    });
  const roles = [
    { role: ROLE_SSI_MANAGER, label: "SSI manager" },
    { role: ROLE_KYC, label: "KYC" },
    { role: ROLE_CONTROL_LIST, label: "control list" },
    { role: ROLE_ISSUER, label: "issuer" },
  ];
  const participants = [
    { address: MARKET, label: "the market" },
    { address: SETTLEMENT, label: "settlement" },
    { address: admin, label: `your wallet (${truncateAddress(admin)})` },
  ];
  const calls = bootstrapCompliance(bond, {
    issuer: admin,
    kyc: { issuer: admin },
    selfSetup: { admin },
  });
  return [
    ...roles.map((r, i) => ({
      call: needCall(calls, i),
      label: `Grant the ${r.label} role`,
      isDone: () => hasRole(r.role),
    })),
    {
      call: needCall(calls, 4),
      label: "Register your wallet as KYC issuer",
      isDone: () => isIssuer(),
    },
    ...participants.map((p, i) => ({
      call: needCall(calls, 5 + i),
      label: `Grant KYC to ${p.label}`,
      isDone: async () => (await kycStatus(p.address)) !== 0,
    })),
    ...participants.map((p, i) => ({
      call: needCall(calls, 8 + i),
      label: `Allowlist ${p.label}`,
      isDone: () => inControlList(p.address),
    })),
  ];
}

async function stepCompliance(cx: Ctx): Promise<void> {
  if (cx.draft.complianceDone) {
    return;
  }
  const bond = needBond(cx.draft);
  const tasks = complianceTasks(cx, bond);
  for (const [i, task] of tasks.entries()) {
    const progress = `(${i + 1}/${tasks.length})`;
    cx.onStep("compliance", { status: "working", label: `${progress} ${task.label} — checking…` });
    if (await task.isDone()) {
      continue;
    }
    await sendPrepared(cx.wallet, task.call, `${progress} ${task.label}`, "compliance", cx.onStep);
  }
  cx.draft.complianceDone = true;
  cx.save();
}

/** Mint face-value units (1 USDC per unit) to the issuer wallet. */
async function stepMint(cx: Ctx): Promise<void> {
  if (cx.draft.mintDone) {
    return;
  }
  const bond = needBond(cx.draft);
  const units = unitsOf(cx.draft);
  cx.onStep("mint", { status: "working", label: "Checking issued supply…" });
  const supply = await publicClient.readContract({
    address: bond,
    abi: erc20Abi,
    functionName: "totalSupply",
  });
  if (supply < units) {
    await sendPrepared(
      cx.wallet,
      issueUnits(bond, cx.wallet.account.address, units - supply),
      `Minting ${units - supply} bond units`,
      "mint",
      cx.onStep,
    );
  }
  cx.draft.mintDone = true;
  cx.save();
}

async function stepQuote(cx: Ctx): Promise<ApiQuote> {
  cx.onStep("quote", {
    status: "working",
    label: "Requesting a signed quote from the oracle API…",
  });
  const quote = await fetchFreshQuote(cx.draft.invoiceUuid);
  if (quote.invoiceId.toLowerCase() !== cx.draft.invoiceId.toLowerCase()) {
    throw new Error(
      "The API returned a quote for a different invoice — discard the draft and start over.",
    );
  }
  return quote;
}

async function stepList(cx: Ctx, quote: ApiQuote): Promise<void> {
  const bond = needBond(cx.draft);
  cx.draft.listTx = await execute(
    cx.wallet,
    {
      address: MARKET,
      abi: invoiceMarketAbi,
      functionName: "listInvoice",
      args: [
        cx.draft.invoiceId,
        bond,
        unitsOf(cx.draft),
        BigInt(cx.draft.maturity),
        {
          invoiceId: quote.invoiceId,
          faceValue: BigInt(quote.faceValue),
          discountRateBps: quote.discountRateBps,
          validUntil: BigInt(quote.validUntil),
          nonce: BigInt(quote.nonce),
        },
        quote.signature,
      ],
    },
    "Confirm the listing in your wallet…",
    "Listing reverted on-chain.",
    (label, hash) => cx.onStep("list", { status: "working", label, hash }),
  );
  cx.save();
}

/**
 * Run (or resume) the whole issuance for a draft. Emits per-step updates;
 * throws on the first failure — the UI attributes the error to the last
 * working step and the draft stays resumable.
 */
async function attestIssued(uuid: string): Promise<number> {
  const res = await fetch(`${API_URL}/v1/invoices/${uuid}/attest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "issued" }),
  });
  if (!res.ok) {
    throw new Error(`attest failed: ${res.status}`);
  }
  const body = (await res.json()) as { sequenceNumber?: number };
  return body.sequenceNumber ?? 0;
}

export async function runIssuance(opts: {
  getWalletClient: GetWallet;
  draft: IssuanceDraft;
  /** Called after every persisted progress change (already saved to localStorage). */
  onDraft?: (draft: IssuanceDraft) => void;
  onStep: OnStepUpdate;
}): Promise<void> {
  const wallet = await connectOnHedera(opts.getWalletClient);
  const { draft, onStep } = opts;
  const cx: Ctx = {
    wallet,
    draft,
    onStep,
    save: () => {
      saveDraft(draft);
      opts.onDraft?.(draft);
    },
  };

  const run = async (step: IssuanceStepId, fn: () => Promise<void>) => {
    onStep(step, { status: "working" });
    await fn();
    onStep(step, { status: "done" });
  };

  await run("deploy", () => stepDeploy(cx));
  await run("resolve", () => stepResolve(cx));
  await run("compliance", () => stepCompliance(cx));
  await run("mint", () => stepMint(cx));

  // A resumed draft may already be listed (refresh between send and save).
  if (!draft.listTx && (await isListed(draft.invoiceId))) {
    draft.listTx = "0x";
    cx.save();
  }
  if (draft.listTx) {
    for (const step of ["quote", "approve", "list"] as const) {
      onStep(step, { status: "done", label: "Already listed" });
    }
    return;
  }

  let quote: ApiQuote | undefined;
  await run("quote", async () => {
    quote = await stepQuote(cx);
  });
  await run("approve", () =>
    approveIfNeeded(wallet, needBond(draft), MARKET, unitsOf(draft), "bond units", (label, hash) =>
      onStep("approve", { status: "working", label, hash }),
    ),
  );
  await run("list", async () => {
    if (!quote) {
      throw new Error("Quote missing — retry.");
    }
    await stepList(cx, quote);
  });
  // Best-effort: the listing is final on-chain either way; an API hiccup
  // annotates the step instead of failing the issuance.
  await run("attest", async () => {
    if (cx.draft.attested) {
      return;
    }
    try {
      const seq = await attestIssued(cx.draft.invoiceUuid);
      cx.draft.attested = true;
      cx.save();
      cx.onStep("attest", { status: "done", label: `HCS sequence ${seq}` });
    } catch {
      cx.draft.attested = true;
      cx.save();
      cx.onStep("attest", {
        status: "done",
        label: "Skipped — the API was unreachable; the listing itself is final on-chain.",
      });
    }
  });
}
