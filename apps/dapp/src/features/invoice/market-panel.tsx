"use client";

// Secondary market for one bond: the open-ask order book (fill or cancel)
// and a sell form for holders (bond approve → makeAsk). Live bonds execute
// real InvoiceMarket transactions; demo fixtures render mock asks inert.

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Hex } from "viem";

import { UsdcIcon } from "@/components/icons";
import { useToast } from "@/components/toast";
import { useWallet } from "@/features/wallet/wallet-provider";
import { fmtPct, fmtUsdc, truncateAddress } from "@/lib/format";
import { DEMO_DATA, humanizeTxError } from "@/lib/live/chain";
import { useBondBalance } from "@/lib/live/hooks";
import { cancelAskTx, fillAskTx, makeAskTx, type StageFn } from "@/lib/live/tx";
import {
  accretedUnitPriceMicro,
  askYtmPct,
  demoAsks,
  HOLDINGS,
  type InvoiceBond,
  type LiveBondRefs,
  type OpenAsk,
} from "@/lib/mock";
import { AmountPanel, type TxState, TxStatus } from "./buy-panel";
import { SectionTitle } from "./sections";

const MICRO = 1e6;
const DEMO_TOAST = "Demo data — set NEXT_PUBLIC_DEMO_DATA=0 for live orders";
const NON_DIGITS = /[^0-9]/g;

type KeyedTx = TxState & { key: string };

const fmtUnitPrice = (micro: bigint): string => `$${(Number(micro) / MICRO).toFixed(4)}`;

/** "1200.5" → 1200n (whole bond units; zero when invalid). */
function parseUnitsInt(v: string): bigint {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? BigInt(n) : 0n;
}

/** "0.9652" → µUSDC per unit (zero when invalid). */
function parsePriceMicro(v: string): bigint {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * MICRO)) : 0n;
}

/** Integer input capped at `max` (drops any decimal part). */
function capUnits(v: string, max: bigint): string {
  const whole = (v.split(".")[0] ?? "").replace(NON_DIGITS, "");
  if (whole === "") {
    return "";
  }
  return BigInt(whole) > max ? max.toString() : whole;
}

/* ------------------------------- Order book ------------------------------- */

function FillEditor({
  ask,
  working,
  onFill,
}: Readonly<{
  ask: OpenAsk;
  working: boolean;
  onFill: (ask: OpenAsk, units: bigint) => void;
}>) {
  const [units, setUnits] = useState(ask.unitsRemaining.toString());
  const fillUnits = parseUnitsInt(units);
  const cost = Number(fillUnits * ask.pricePerUnit) / MICRO;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl bg-shade/60 p-3">
      <input
        value={units}
        onChange={(e) => setUnits(capUnits(e.target.value, ask.unitsRemaining))}
        inputMode="numeric"
        aria-label="Units to buy"
        className="tabular h-8 w-28 rounded-full border border-line bg-white px-3 text-xs outline-none focus:border-ink"
      />
      <span className="tabular text-xs text-soft">
        of {ask.unitsRemaining.toString()} units · pay {fmtUsdc(cost)}
      </span>
      <button
        type="button"
        disabled={working || fillUnits === 0n}
        onClick={() => onFill(ask, fillUnits)}
        className="ml-auto rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-60"
      >
        {working ? "Working…" : "Confirm Purchase"}
      </button>
    </div>
  );
}

function AskRow({
  bond,
  ask,
  own,
  address,
  connect,
  tx,
  working,
  onFill,
  onCancel,
}: Readonly<{
  bond: InvoiceBond;
  ask: OpenAsk;
  own: boolean;
  address?: string;
  connect: () => void;
  tx: KeyedTx | null;
  working: boolean;
  onFill: (ask: OpenAsk, units: bigint) => void;
  onCancel: (ask: OpenAsk) => void;
}>) {
  const [open, setOpen] = useState(false);
  const rowTx =
    tx && (tx.key === `fill:${ask.askId}` || tx.key === `cancel:${ask.askId}`) ? tx : null;

  return (
    <>
      <tr>
        <td className="py-3 pr-4 font-mono text-xs">{own ? "You" : truncateAddress(ask.seller)}</td>
        <td className="tabular py-3 pr-4">{ask.unitsRemaining.toString()}</td>
        <td className="tabular py-3 pr-4">{fmtUnitPrice(ask.pricePerUnit)}</td>
        <td className="tabular py-3 pr-4">{fmtPct(askYtmPct(ask.pricePerUnit, bond))}</td>
        <td className="py-3 text-right">
          {own ? (
            <button
              type="button"
              disabled={working}
              onClick={() => onCancel(ask)}
              className="rounded-full border border-line px-4 py-1.5 text-xs font-medium text-soft hover:text-ink disabled:opacity-60"
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              disabled={working}
              onClick={() => (address ? setOpen(!open) : connect())}
              className="rounded-full bg-ink px-4 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-60"
            >
              Fill
            </button>
          )}
        </td>
      </tr>
      {open && !own && (
        <tr>
          <td colSpan={5} className="pb-3">
            <FillEditor ask={ask} working={working} onFill={onFill} />
          </td>
        </tr>
      )}
      {rowTx && (
        <tr>
          <td colSpan={5} className="pb-3">
            <TxStatus
              tx={rowTx}
              done={
                rowTx.key.startsWith("fill:")
                  ? "Purchase confirmed."
                  : "Ask cancelled — units returned to your wallet."
              }
            />
          </td>
        </tr>
      )}
    </>
  );
}

/* -------------------------------- Sell form ------------------------------- */

function SellForm({
  bond,
  held,
  tx,
  onSubmit,
}: Readonly<{
  bond: InvoiceBond;
  held: bigint;
  tx: KeyedTx | null;
  onSubmit: (units: bigint, priceMicro: bigint) => void;
}>) {
  const [unitsStr, setUnitsStr] = useState("");
  // Default ask price: the current accreted carrying value per unit.
  const [priceStr, setPriceStr] = useState(() =>
    (Number(accretedUnitPriceMicro(bond)) / MICRO).toFixed(4),
  );
  const units = parseUnitsInt(unitsStr);
  const priceMicro = parsePriceMicro(priceStr);
  const proceeds = Number(units * priceMicro) / MICRO;
  const state = tx?.key === "sell" ? tx : null;
  const working = tx?.stage === "working";

  const unitChip = (
    <span className="flex shrink-0 items-center rounded-full border border-line bg-white px-3 py-1.5 text-sm font-medium">
      Units
    </span>
  );
  const usdcChip = (
    <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white py-1.5 pr-3 pl-1.5 text-sm font-medium">
      <UsdcIcon size={22} />
      USDC
    </span>
  );

  return (
    <div className="mt-8">
      <h3 className="text-[15px] font-medium">Sell Your Units</h3>
      <p className="mt-1 text-xs text-soft">
        You hold {held.toString()} units (1 unit = 1 USDC face). Placing an ask escrows the units in
        the market until filled or cancelled.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <AmountPanel
          label={`Units to sell (max ${held})`}
          value={unitsStr}
          onChange={(v) => setUnitsStr(capUnits(v, held))}
          tokenChip={unitChip}
        />
        <AmountPanel
          label="Price per unit"
          value={priceStr}
          onChange={setPriceStr}
          tokenChip={usdcChip}
        />
      </div>
      <div className="tabular mt-3 text-xs text-soft">
        {units > 0n && priceMicro > 0n
          ? `Escrows ${units} units · proceeds ${fmtUsdc(proceeds)} if fully filled · buyer's implied YTM ${fmtPct(askYtmPct(priceMicro, bond))}`
          : "Enter units and a price per unit to preview proceeds."}
      </div>
      <button
        type="button"
        disabled={working || units === 0n || priceMicro === 0n}
        onClick={() => onSubmit(units, priceMicro)}
        className="mt-4 h-12 w-full rounded-xl bg-ink text-sm font-medium text-white transition-colors hover:bg-black disabled:opacity-60"
      >
        {working && state ? "Working…" : "Place Ask"}
      </button>
      {state && (
        <TxStatus
          tx={state}
          done="Ask placed — your units are escrowed until filled or cancelled."
        />
      )}
    </div>
  );
}

/* --------------------------------- Section -------------------------------- */

/**
 * Secondary-market section on the invoice detail page. Open asks come from
 * AskCreated events + asks(askId) state (mirror node) or the subgraph, and
 * from deterministic fixtures in demo mode.
 */
export function MarketSection({ bond }: Readonly<{ bond: InvoiceBond }>) {
  const { address, connect, getWalletClient } = useWallet();
  const queryClient = useQueryClient();
  const [toast, showToast] = useToast();
  const [tx, setTx] = useState<KeyedTx | null>(null);
  const balance = useBondBalance(bond, address);

  const live = bond.live;
  const demoHeld = address ? BigInt(HOLDINGS.find((h) => h.bondId === bond.id)?.faceUsdc ?? 0) : 0n;
  const held = live && !DEMO_DATA ? (balance.data ?? 0n) : demoHeld;
  const asks = [...(live ? live.asks : demoAsks(bond))].sort((a, b) =>
    Number(a.pricePerUnit - b.pricePerUnit),
  );
  const working = tx?.stage === "working";

  if (bond.status !== "open" && bond.status !== "funded") {
    return null;
  }

  async function runTx(key: string, task: (onStage: StageFn) => Promise<Hex>) {
    try {
      const hash = await task((label, txHash) =>
        setTx((prev) => ({
          key,
          stage: "working",
          label,
          hash: txHash ?? (prev?.key === key ? prev.hash : undefined),
        })),
      );
      setTx({ key, stage: "done", hash });
      await queryClient.invalidateQueries();
    } catch (err) {
      setTx((prev) => ({
        key,
        stage: "error",
        hash: prev?.key === key ? prev.hash : undefined,
        error: humanizeTxError(err),
      }));
    }
  }

  /** Live refs, or a demo toast and null. */
  function liveOrToast(): LiveBondRefs | null {
    if (!live || DEMO_DATA) {
      showToast(DEMO_TOAST);
      return null;
    }
    return live;
  }

  function placeAsk(units: bigint, priceMicro: bigint) {
    const refs = liveOrToast();
    if (!refs) {
      return;
    }
    runTx("sell", (onStage) =>
      makeAskTx({ getWalletClient, refs, units, priceMicro, held, onStage }),
    );
  }

  function fillAsk(ask: OpenAsk, units: bigint) {
    const refs = liveOrToast();
    if (!refs || !address) {
      return;
    }
    runTx(`fill:${ask.askId}`, (onStage) =>
      fillAskTx({
        getWalletClient,
        buyer: address,
        askId: ask.askId,
        units,
        remaining: ask.unitsRemaining,
        cost: units * ask.pricePerUnit,
        onStage,
      }),
    );
  }

  function cancelAsk(ask: OpenAsk) {
    if (!liveOrToast()) {
      return;
    }
    runTx(`cancel:${ask.askId}`, (onStage) =>
      cancelAskTx({ getWalletClient, askId: ask.askId, onStage }),
    );
  }

  return (
    <section id="market" className="mt-12 scroll-mt-24">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Secondary Market</SectionTitle>
        {address && held > 0n && (
          <span className="tabular text-sm text-soft">You hold {held.toString()} units</span>
        )}
      </div>

      {asks.length === 0 ? (
        <p className="mt-4 text-sm text-soft">No open asks for this bond yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-soft">
                <th className="py-2.5 pr-4 font-medium">Seller</th>
                <th className="py-2.5 pr-4 font-medium">Units</th>
                <th className="py-2.5 pr-4 font-medium">Price / unit</th>
                <th className="py-2.5 pr-4 font-medium">Implied YTM</th>
                <th className="py-2.5 font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {asks.map((ask) => (
                <AskRow
                  key={ask.askId.toString()}
                  bond={bond}
                  ask={ask}
                  own={ask.seller.toLowerCase() === address?.toLowerCase()}
                  address={address}
                  connect={connect}
                  tx={tx}
                  working={working}
                  onFill={fillAsk}
                  onCancel={cancelAsk}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {address && held > 0n && <SellForm bond={bond} held={held} tx={tx} onSubmit={placeAsk} />}
      {toast}
    </section>
  );
}
