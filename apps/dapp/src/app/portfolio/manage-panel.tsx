"use client";

import { useState } from "react";

import { SubmitButton } from "@/components/submit-button";
import { Toggle } from "@/components/toggle";
import type { OwnedWallet } from "@/server/wallet-actions";
import {
  addWalletAction,
  executeNowAction,
  removeWalletAction,
  signOutAction,
  updateWalletAction,
} from "@/server/wallet-actions";

const fmtUsd = (n: number) =>
  n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;

export function ManagePanel({
  address,
  wallet,
  balanceEth,
  ethUsd,
}: {
  address: string;
  wallet: OwnedWallet;
  balanceEth: number | null;
  ethUsd: number | null;
}) {
  const [ccy, setCcy] = useState<"ETH" | "USD">("ETH");
  const [fund, setFund] = useState(String(wallet?.fund_eth ?? ""));
  const fundEth = (() => {
    const n = Number(fund);
    if (!Number.isFinite(n)) return 0;
    return ccy === "USD" && ethUsd ? n / ethUsd : n;
  })();

  const setMax = () => {
    if (balanceEth === null) return;
    setFund(ccy === "USD" && ethUsd ? (balanceEth * ethUsd).toFixed(2) : balanceEth.toFixed(4));
  };

  return (
    <div className="rounded-2xl border border-line/60 p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Automation</h3>
          <span className="font-mono text-xs text-soft">
            verified {address.slice(0, 6)}…{address.slice(-4)}
          </span>
          <div className="mt-1 text-xs text-soft">
            Balance:{" "}
            {balanceEth === null
              ? "—"
              : `${balanceEth.toFixed(4)} ETH${ethUsd ? ` · ${fmtUsd(balanceEth * ethUsd)}` : ""}`}
          </div>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="text-xs text-soft hover:text-ink">
            sign out
          </button>
        </form>
      </div>

      {!wallet ? (
        <form action={addWalletAction} className="flex flex-col gap-3">
          <p className="text-sm text-soft">
            Aktifkan bot untuk wallet ini: paste private key-nya (dienkripsi di server). Harus key
            dari wallet yang barusan kamu sign.
          </p>
          <input
            name="name"
            placeholder="Nama (opsional)"
            className="rounded-lg border border-line/60 px-3 py-2 text-sm"
          />
          <input
            name="privateKey"
            type="password"
            required
            placeholder="0x… private key"
            autoComplete="off"
            className="rounded-lg border border-line/60 px-3 py-2 font-mono text-sm"
          />
          <SubmitButton
            pendingText="Mengaktifkan…"
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Enable automation
          </SubmitButton>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <form action={updateWalletAction} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="fundEth" value={fundEth} />
            <label className="flex flex-col gap-1 text-xs">
              Fund
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={fund}
                  onChange={(e) => setFund(e.target.value)}
                  className="w-28 rounded-lg border border-line/60 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setCcy((c) => (c === "ETH" ? "USD" : "ETH"))}
                  className="rounded-lg border border-line/60 px-2 py-2 text-xs hover:bg-shade"
                >
                  {ccy}
                </button>
                <button
                  type="button"
                  onClick={setMax}
                  disabled={balanceEth === null}
                  className="rounded-lg border border-line/60 px-2 py-2 text-xs hover:bg-shade disabled:opacity-50"
                >
                  Max
                </button>
              </div>
              {ethUsd && fundEth > 0 && (
                <span className="text-soft">
                  {ccy === "ETH" ? `≈ ${fmtUsd(fundEth * ethUsd)}` : `≈ ${fundEth.toFixed(4)} ETH`}
                </span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Max/pool (ETH)
              <input
                name="maxPerPoolEth"
                type="number"
                step="0.01"
                min="0"
                defaultValue={wallet.max_per_pool_eth}
                className="w-28 rounded-lg border border-line/60 px-3 py-2 text-sm"
              />
            </label>
            <div className="flex flex-col gap-2 pb-1">
              <Toggle name="automation" defaultChecked={wallet.automation === 1} label="automation" />
              <Toggle name="autoswap" defaultChecked={wallet.autoswap === 1} label="auto-swap" />
            </div>
            <SubmitButton
              pendingText="Menyimpan…"
              className="rounded-lg border border-line/60 px-4 py-2 text-sm hover:bg-shade disabled:opacity-60"
            >
              Save
            </SubmitButton>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <form action={executeNowAction}>
              <SubmitButton
                pendingText="Menjalankan…"
                disabled={wallet.automation === 0 || wallet.fund_eth === 0}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Execute now
              </SubmitButton>
            </form>
            <form action={removeWalletAction}>
              <button type="submit" className="text-sm text-red-600 hover:underline">
                remove wallet
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
