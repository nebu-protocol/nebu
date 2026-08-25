"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown } from "lucide-react";
import { useState } from "react";

import { CompanyAvatar, UsdcIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { useWallet } from "@/features/wallet/wallet-provider";
import { fmtDate, fmtPct, fmtUsdc, truncateAddress } from "@/lib/format";
import { humanizeTxError, txLink } from "@/lib/live/chain";
import { useUsdcStatus } from "@/lib/live/hooks";
import { buyPrimaryTx } from "@/lib/live/tx";
import { type InvoiceBond, impliedApyPct, type LiveBondRefs, pricePerFace } from "@/lib/mock";

const sanitizeAmount = (v: string) => v.replace(/[^0-9.]/g, "");
const MICRO = 1e6;

export type TxState = {
  stage: "idle" | "working" | "done" | "error";
  label?: string;
  hash?: string;
  error?: string;
};

export function AmountPanel({
  label,
  value,
  onChange,
  tokenChip,
  readOnly = false,
}: Readonly<{
  label: string;
  value: string;
  onChange?: (v: string) => void;
  tokenChip: React.ReactNode;
  readOnly?: boolean;
}>) {
  return (
    <div className="rounded-2xl bg-[#f6f6f4] p-4">
      <div className="text-xs text-soft">{label}</div>
      <div className="mt-1.5 flex items-center gap-3">
        <input
          value={value}
          onChange={(e) => onChange?.(sanitizeAmount(e.target.value))}
          readOnly={readOnly}
          inputMode="decimal"
          placeholder="0"
          aria-label={label}
          className="tabular w-full min-w-0 bg-transparent text-[28px] font-medium outline-none placeholder:text-faint"
        />
        {tokenChip}
      </div>
    </div>
  );
}

/** Small status/result strip under an action button. */
export function TxStatus({
  tx,
  done = "Purchase confirmed.",
}: Readonly<{ tx: TxState; done?: string }>) {
  if (tx.stage === "idle") return null;
  return (
    <div className="mt-3 text-xs" role="status">
      {tx.stage === "working" && <p className="text-soft">{tx.label}</p>}
      {tx.stage === "done" && <p className="font-medium text-pos">{done}</p>}
      {tx.stage === "error" && (
        <p className="text-neg" role="alert">
          {tx.error}
        </p>
      )}
      {tx.hash && (
        <a
          href={txLink(tx.hash)}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block underline hover:text-ink"
        >
          View transaction on HashScan
        </a>
      )}
    </div>
  );
}

/** Connect / submit button with the SDK-booting shimmer. */
function ActionButton({
  booting,
  address,
  working,
  connect,
  label,
  onSubmit,
}: Readonly<{
  booting: boolean;
  address?: string;
  working: boolean;
  connect: () => void;
  label: string;
  onSubmit: () => void;
}>) {
  if (booting) {
    return <div aria-hidden className="mt-4 h-12 w-full animate-pulse rounded-xl bg-shade" />;
  }
  return (
    <button
      type="button"
      disabled={working}
      onClick={address ? onSubmit : connect}
      className="mt-4 h-12 w-full rounded-xl bg-ink text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-60"
    >
      {address ? (working ? "Working…" : label) : "Connect Wallet"}
    </button>
  );
}

const formatAmount = (n: number): string =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2, useGrouping: false });

function closedMessage(bond: InvoiceBond): string {
  if (bond.status === "matured") {
    return `This bond matured on ${fmtDate(bond.maturityDate)}. Holders claim their payout from the Portfolio page once settlement runs.`;
  }
  if (bond.status === "funded") {
    return "The primary sale is fully funded. Holdings appear on the Portfolio page.";
  }
  return `This bond was repaid in full and settled. Holders received ${fmtUsdc(bond.faceValueUsdc)}.`;
}

/** Spend input → whole bond units at the on-chain price (or the demo ratio). */
function orderMath(bond: InvoiceBond, spend: string) {
  const live = bond.live;
  const price = pricePerFace(bond);
  const spendNum = Number(spend);
  const valid = spend !== "" && Number.isFinite(spendNum) && spendNum > 0;
  const units =
    live && valid && live.pricePerUnit > 0n
      ? BigInt(Math.floor(spendNum * MICRO)) / live.pricePerUnit
      : 0n;
  const cost = live ? units * live.pricePerUnit : 0n;
  const facePerUnit =
    live && live.totalUnits > 0n ? bond.faceValueUsdc / Number(live.totalUnits) : 0;
  const receive = valid ? formatAmount(live ? Number(units) * facePerUnit : spendNum / price) : "";
  const liveOrder = valid ? ` · buys ${units} units for ${fmtUsdc(Number(cost) / MICRO)}` : "";
  const summary = live
    ? `${fmtUsdc(Number(live.pricePerUnit) / MICRO)} per unit · ${live.unitsRemaining} units left · matures ${fmtDate(bond.maturityDate)}${liveOrder}`
    : `1 USDC face = $${price.toFixed(4)} · implied APY ${fmtPct(impliedApyPct(bond))} · paid out ${fmtDate(bond.maturityDate)}`;
  return { units, cost, receive, summary };
}

/**
 * Buy widget. Live bonds execute a real primary purchase on Hedera testnet
 * (pre-checks → fresh API quote → USDC approve → buyPrimary(invoiceId, units));
 * demo fixtures keep the inert toast.
 */
export function BuyPanel({ bond }: Readonly<{ bond: InvoiceBond }>) {
  const { address, booting, connect, getWalletClient } = useWallet();
  const queryClient = useQueryClient();
  const [spend, setSpend] = useState("");
  const [tx, setTx] = useState<TxState>({ stage: "idle" });
  const [toast, showToast] = useToast();
  const usdc = useUsdcStatus(bond.live ? address : undefined);

  const live = bond.live;
  const buyable = bond.status === "open" || (bond.status === "funded" && !live);
  const title = bond.status === "funded" ? "Buy on Secondary Market" : "Fund this Invoice";
  const { units, cost, receive, summary } = orderMath(bond, spend);

  async function buy(refs: LiveBondRefs, buyer: string) {
    try {
      const hash = await buyPrimaryTx({
        getWalletClient,
        refs,
        buyer,
        units,
        cost,
        onStage: (label, txHash) =>
          setTx((prev) => ({ stage: "working", label, hash: txHash ?? prev.hash })),
      });
      setTx({ stage: "done", hash });
      setSpend("");
      await queryClient.invalidateQueries();
    } catch (err) {
      setTx((prev) => ({ stage: "error", hash: prev.hash, error: humanizeTxError(err) }));
    }
  }

  const usdcChip = (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white py-1.5 pr-3 pl-1.5 text-sm font-medium">
      <UsdcIcon size={22} />
      USDC
    </span>
  );
  const bondChip = (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white py-1.5 pr-3 pl-1.5 text-sm font-medium">
      <CompanyAvatar name={bond.issuer} className="size-5.5 text-[9px]" />
      {live ? truncateAddress(bond.id) : bond.id.toUpperCase()}
    </span>
  );

  const working = tx.stage === "working";

  return (
    <div className="rounded-3xl border border-line bg-white p-5">
      <div className="border-b border-line pb-3 text-[15px] font-medium">{title}</div>

      {buyable ? (
        <>
          <div className="relative mt-4 flex flex-col gap-1.5">
            <AmountPanel label="Spend" value={spend} onChange={setSpend} tokenChip={usdcChip} />
            <span className="absolute top-1/2 left-1/2 z-10 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white">
              <ArrowDown size={16} className="text-soft" />
            </span>
            <AmountPanel
              label="Face value at maturity"
              value={receive}
              tokenChip={bondChip}
              readOnly
            />
          </div>

          <div className="tabular mt-3 text-xs text-soft">{summary}</div>
          {live && usdc.data && (
            <div className="tabular mt-1 text-xs text-soft">
              Wallet USDC: {fmtUsdc(Number(usdc.data.balance) / MICRO)}
            </div>
          )}

          <ActionButton
            booting={booting}
            address={address}
            working={working}
            connect={connect}
            label={bond.status === "funded" ? "Place Order" : "Fund Invoice"}
            onSubmit={() =>
              live && address
                ? buy(live, address)
                : showToast("Demo data — set NEXT_PUBLIC_DEMO_DATA=0 for live orders")
            }
          />

          <TxStatus tx={tx} />

          <p className="mt-4 text-[11px] leading-relaxed text-faint">
            {live
              ? "Orders execute on Hedera testnet with testnet USDC. Invoice bonds are offered only to verified investors in eligible jurisdictions."
              : "Demo interface with mock data — no real order is placed. Invoice bonds are offered only to verified investors in eligible jurisdictions."}
          </p>
        </>
      ) : (
        <div className="mt-4 rounded-2xl bg-shade/60 p-4 text-sm text-body">
          {closedMessage(bond)}
        </div>
      )}

      {toast}
    </div>
  );
}
