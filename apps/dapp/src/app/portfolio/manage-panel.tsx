"use client";

import type { OwnedWallet } from "@/server/wallet-actions";
import {
  addWalletAction,
  executeNowAction,
  removeWalletAction,
  signOutAction,
  updateWalletAction,
} from "@/server/wallet-actions";

/**
 * Panel kelola automation untuk wallet yang sudah SIWE-verified.
 * Add wallet = paste private key wallet yang di-sign (server memverifikasi
 * key menurunkan ke address yang sama).
 */
export function ManagePanel({ address, wallet }: { address: string; wallet: OwnedWallet }) {
  return (
    <div className="rounded-xl border border-line/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Automation</h3>
          <span className="font-mono text-xs text-soft">
            verified {address.slice(0, 6)}…{address.slice(-4)}
          </span>
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
          <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white">
            Enable automation
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <form action={updateWalletAction} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              Fund (ETH)
              <input
                name="fundEth"
                type="number"
                step="0.01"
                min="0"
                defaultValue={wallet.fund_eth}
                className="w-28 rounded-lg border border-line/60 px-3 py-2 text-sm"
              />
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
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="automation" defaultChecked={wallet.automation === 1} /> automation
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="autoswap" defaultChecked={wallet.autoswap === 1} /> auto-swap
            </label>
            <button type="submit" className="rounded-lg border border-line/60 px-3 py-2 text-sm">
              Save
            </button>
          </form>
          <div className="flex items-center gap-3">
            <form action={executeNowAction}>
              <button
                type="submit"
                disabled={wallet.automation === 0 || wallet.fund_eth === 0}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Execute now
              </button>
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
