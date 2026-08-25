// Transaction pipelines for the live testnet: buy (USDC approve +
// InvoiceMarket.buyPrimary) and claim (bond approve + MaturitySettlement.claim).
// Plain async functions — the UI supplies a stage callback and catches errors.

import {
  type Abi,
  type Account,
  type Address,
  type Chain,
  erc20Abi,
  type Hex,
  type Transport,
  type WalletClient,
} from "viem";
import { fmtUsdc } from "@/lib/format";
import type { LiveBondRefs } from "@/lib/mock";
import {
  CHAIN_ID,
  fetchFreshQuote,
  fetchUsdcStatus,
  invoiceMarketAbi,
  isDecodedRevert,
  MARKET,
  maturitySettlementAbi,
  publicClient,
  SETTLEMENT,
  USDC,
  USDC_TOKEN_ID,
} from "./chain";

export type Wallet = WalletClient<Transport, Chain, Account>;

/** Progress callback; `hash` is set once a tx is in flight. */
export type StageFn = (label: string, hash?: Hex) => void;

export type GetWallet = (() => Promise<Wallet>) | undefined;

const MICRO = 1e6;

export async function connectOnHedera(getWalletClient: GetWallet): Promise<Wallet> {
  if (!getWalletClient) {
    throw new Error("Wallet client unavailable — reconnect your wallet and retry.");
  }
  const wallet = await getWalletClient();
  if (wallet.chain.id !== CHAIN_ID) {
    throw new Error("Switch your wallet to Hedera Testnet (chain 296) and retry.");
  }
  return wallet;
}

export async function waitOk(hash: Hex, failMessage: string): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 });
  if (receipt.status !== "success") {
    throw new Error(failMessage);
  }
}

async function readAllowanceRpc(token: Address, owner: Address, spender: Address): Promise<bigint> {
  return await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
}

export async function approveIfNeeded(
  wallet: Wallet,
  token: Address,
  spender: Address,
  amount: bigint,
  label: string,
  onStage: StageFn,
): Promise<void> {
  const allowance = await readAllowanceRpc(token, wallet.account.address, spender);
  if (allowance >= amount) {
    return;
  }
  onStage(`Approve ${label} in your wallet…`);
  const hash = await wallet.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
  });
  onStage("Waiting for the approval…", hash);
  await waitOk(hash, `The ${label} approval reverted on-chain.`);
}

type Call = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };

/** Dry-run (decoded reverts abort; infra hiccups pass), send, await receipt. */
export async function execute(
  wallet: Wallet,
  call: Call,
  prompt: string,
  failMessage: string,
  onStage: StageFn,
): Promise<Hex> {
  try {
    await publicClient.simulateContract({ ...call, account: wallet.account });
  } catch (err) {
    if (isDecodedRevert(err)) {
      throw err; // humanized by the caller
    }
    // Simulation infra hiccup — let the real transaction decide.
  }
  onStage(prompt);
  const hash = await wallet.writeContract({
    ...call,
    account: wallet.account,
    chain: wallet.chain,
  });
  onStage("Waiting for confirmation…", hash);
  await waitOk(hash, failMessage);
  return hash;
}

/** Mirror-node pre-checks with distinct human messages (association, KYC, balance). */
async function ensureUsdcEligibility(buyer: string, cost: bigint): Promise<void> {
  const status = await fetchUsdcStatus(buyer);
  if (!status.associated) {
    throw new Error(
      `Your wallet is not associated with testnet USDC (${USDC_TOKEN_ID}). Associate the token in your wallet, then retry.`,
    );
  }
  if (!status.kycGranted) {
    throw new Error(
      "Your wallet is not KYC'd for testnet USDC, so the token layer will reject the transfer. Use a KYC'd wallet.",
    );
  }
  if (status.balance < cost) {
    throw new Error(
      `Insufficient USDC: this purchase needs ${fmtUsdc(Number(cost) / MICRO)} but the wallet holds ${fmtUsdc(Number(status.balance) / MICRO)}.`,
    );
  }
}

/**
 * Fresh signed quote from the oracle API. The on-chain price was fixed at
 * listing, so this is a freshness/sanity check, not tx input — buyPrimary's
 * real signature is (bytes32 invoiceId, uint256 units).
 */
async function ensureFreshQuote(refs: LiveBondRefs, onStage: StageFn): Promise<void> {
  if (!refs.apiUuid) {
    return; // API does not know this invoice — reads stay chain-only
  }
  onStage("Fetching a fresh discount quote…");
  const quote = await fetchFreshQuote(refs.apiUuid).catch(() => undefined);
  if (quote && quote.validUntil * 1000 < Date.now()) {
    throw new Error("The discount quote expired — request a fresh quote and retry.");
  }
}

/** Full primary-purchase pipeline; resolves to the buyPrimary tx hash. */
export async function buyPrimaryTx(opts: {
  getWalletClient: GetWallet;
  refs: LiveBondRefs;
  buyer: string;
  units: bigint;
  cost: bigint;
  onStage: StageFn;
}): Promise<Hex> {
  const { refs, units, cost, onStage } = opts;
  onStage("Checking eligibility…");
  if (units === 0n) {
    throw new Error(
      `Enter at least ${fmtUsdc(Number(refs.pricePerUnit) / MICRO)} (the price of one bond unit).`,
    );
  }
  if (units > refs.unitsRemaining) {
    throw new Error(`Only ${refs.unitsRemaining} units remain in this sale — lower the amount.`);
  }
  await ensureUsdcEligibility(opts.buyer, cost);
  await ensureFreshQuote(refs, onStage);
  const wallet = await connectOnHedera(opts.getWalletClient);
  await approveIfNeeded(wallet, USDC, MARKET, cost, "USDC", onStage);
  return await execute(
    wallet,
    {
      address: MARKET,
      abi: invoiceMarketAbi,
      functionName: "buyPrimary",
      args: [refs.invoiceId, units],
    },
    "Confirm the purchase in your wallet…",
    "Purchase reverted on-chain — the token layer rejects transfers for wallets without USDC association or KYC.",
    onStage,
  );
}

/** Ask pipeline: approve the escrowed bond units, then makeAsk(invoiceId, units, price). */
export async function makeAskTx(opts: {
  getWalletClient: GetWallet;
  refs: LiveBondRefs;
  units: bigint;
  /** Ask price per unit in USDC base units (6 decimals). */
  priceMicro: bigint;
  /** Units the seller currently holds (pre-flight cap). */
  held: bigint;
  onStage: StageFn;
}): Promise<Hex> {
  const { refs, units, priceMicro, onStage } = opts;
  onStage("Preparing ask…");
  if (units === 0n || priceMicro === 0n) {
    throw new Error("Enter the units to sell and a positive price per unit.");
  }
  if (units > opts.held) {
    throw new Error(`This wallet holds only ${opts.held} units of this bond.`);
  }
  const wallet = await connectOnHedera(opts.getWalletClient);
  // makeAsk escrows units via transferFrom — approve them first.
  await approveIfNeeded(wallet, refs.bond, MARKET, units, "bond units", onStage);
  return await execute(
    wallet,
    {
      address: MARKET,
      abi: invoiceMarketAbi,
      functionName: "makeAsk",
      args: [refs.invoiceId, units, priceMicro],
    },
    "Confirm the ask in your wallet…",
    "Ask reverted on-chain.",
    onStage,
  );
}

/** Fill pipeline: USDC pre-checks + approve, then fillAsk(askId, units). */
export async function fillAskTx(opts: {
  getWalletClient: GetWallet;
  buyer: string;
  askId: bigint;
  units: bigint;
  remaining: bigint;
  cost: bigint;
  onStage: StageFn;
}): Promise<Hex> {
  const { askId, units, cost, onStage } = opts;
  onStage("Checking eligibility…");
  if (units === 0n) {
    throw new Error("Enter at least 1 unit to buy.");
  }
  if (units > opts.remaining) {
    throw new Error(`Only ${opts.remaining} units remain in this ask — lower the amount.`);
  }
  await ensureUsdcEligibility(opts.buyer, cost);
  const wallet = await connectOnHedera(opts.getWalletClient);
  await approveIfNeeded(wallet, USDC, MARKET, cost, "USDC", onStage);
  return await execute(
    wallet,
    { address: MARKET, abi: invoiceMarketAbi, functionName: "fillAsk", args: [askId, units] },
    "Confirm the purchase in your wallet…",
    "Fill reverted on-chain — bond units can only be received by wallets KYC'd on this bond.",
    onStage,
  );
}

/** cancelAsk(askId): the escrowed units return to the seller. */
export async function cancelAskTx(opts: {
  getWalletClient: GetWallet;
  askId: bigint;
  onStage: StageFn;
}): Promise<Hex> {
  const { askId, onStage } = opts;
  onStage("Preparing cancel…");
  const wallet = await connectOnHedera(opts.getWalletClient);
  return await execute(
    wallet,
    { address: MARKET, abi: invoiceMarketAbi, functionName: "cancelAsk", args: [askId] },
    "Confirm the cancellation in your wallet…",
    "Cancel reverted on-chain.",
    onStage,
  );
}

/** Claim pipeline: approve the surrendered bond units, then claim(invoiceId). */
export async function claimTx(opts: {
  getWalletClient: GetWallet;
  refs: LiveBondRefs;
  units: bigint;
  onStage: StageFn;
}): Promise<Hex> {
  const { refs, units, onStage } = opts;
  onStage("Preparing claim…");
  const wallet = await connectOnHedera(opts.getWalletClient);
  // claim() surrenders bond units via transferFrom — approve them first.
  await approveIfNeeded(wallet, refs.bond, SETTLEMENT, units, "bond units", onStage);
  return await execute(
    wallet,
    {
      address: SETTLEMENT,
      abi: maturitySettlementAbi,
      functionName: "claim",
      args: [refs.invoiceId],
    },
    "Confirm the claim in your wallet…",
    "Claim reverted on-chain.",
    onStage,
  );
}
