"use client";

import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useState } from "react";

import { useT } from "@/lib/i18n-client";

/**
 * Belum ada sesi SIWE. Connect wallet via Dynamic (banyak wallet + mobile), lalu
 * tanda tangan SIWE untuk membuka manajemen agent LP. Sign pakai wallet Dynamic.
 */
export function PortfolioClient() {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext();
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const signToManage = async () => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) return;
    setSigning(true);
    setError(null);
    try {
      const address = primaryWallet.address;
      const nres = await fetch("/api/siwe/nonce", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const { message } = (await nres.json()) as { message: string };
      const signature = await primaryWallet.signMessage(message);
      const vres = await fetch("/api/siwe/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, signature }),
      });
      if (!vres.ok) {
        setError((await vres.json().catch(() => ({}))).error ?? t("verifikasi gagal"));
        return;
      }
      window.location.reload(); // server render managed view
    } catch {
      setError(t("Tanda tangan dibatalkan."));
    } finally {
      setSigning(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-line/60 p-6 text-center">
      <h2 className="text-lg font-medium">{t("Connect wallet")}</h2>
      <p className="mt-1 text-sm text-soft">
        {t("Hubungkan wallet apa saja (mobile OK), lalu tanda tangan untuk kelola agent LP-mu.")}
      </p>
      {!primaryWallet ? (
        <button
          type="button"
          onClick={() => setShowAuthFlow(true)}
          className="mt-4 w-full rounded-lg bg-ink px-4 py-2 font-medium text-white"
        >
          {t("Connect wallet")}
        </button>
      ) : (
        <button
          type="button"
          onClick={signToManage}
          disabled={signing}
          className="mt-4 w-full rounded-lg bg-ink px-4 py-2 font-medium text-white disabled:opacity-60"
        >
          {signing ? t("Menandatangani…") : t("Sign to manage")}
        </button>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
