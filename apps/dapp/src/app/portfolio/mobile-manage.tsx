"use client";

import { useState } from "react";

import { useT } from "@/lib/i18n-client";
import type { OwnedWallet } from "@/server/wallet-actions";

import { ManagePanel } from "./manage-panel";

type Tab = "deposit" | "withdraw" | "automation";

type Props = {
  owner: string;
  agent: string | null;
  wallet: OwnedWallet;
  balanceEth: number | null;
  ownerBalanceEth: number | null;
  ethUsd: number | null;
  estApr: number | null;
};

/** Mobile (< lg): tombol Deposit/Withdraw/Automation → buka dialog panel. */
export function MobileManage(props: Props) {
  const t = useT();
  const [openTab, setOpenTab] = useState<Tab | null>(null);

  // Belum ada agent → tampilkan panel create langsung (tanpa tombol).
  if (!props.wallet || !props.agent) {
    return (
      <div className="lg:hidden">
        <ManagePanel {...props} />
      </div>
    );
  }

  return (
    <div className="lg:hidden">
      <div className="grid grid-cols-3 gap-2">
        {(["deposit", "withdraw", "automation"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setOpenTab(t)}
            className="rounded-xl border border-line/60 px-2 py-2.5 text-sm font-medium capitalize hover:bg-shade"
          >
            {t}
          </button>
        ))}
      </div>

      {openTab && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <button
            type="button"
            aria-label={t("close")}
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => setOpenTab(null)}
          />
          <div className="relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-3 pt-2 sm:max-w-md sm:rounded-2xl">
            <div className="mb-1 flex justify-end">
              <button
                type="button"
                onClick={() => setOpenTab(null)}
                className="rounded-lg px-2 py-1 text-sm text-soft hover:bg-shade"
              >
                {t("✕ tutup")}
              </button>
            </div>
            <ManagePanel {...props} initialTab={openTab} />
          </div>
        </div>
      )}
    </div>
  );
}
