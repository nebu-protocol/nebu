"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { GeneratedAvatar } from "@/components/generated-avatar";
import { ChainIcon } from "@/components/icons";
import { ACTIVE_CHAIN } from "@/lib/chain";
import { useT } from "@/lib/i18n-client";
import { signOutAction } from "@/server/wallet-actions";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Tombol Wallet navbar via Dynamic.xyz — dukung BANYAK wallet + mobile (deeplink/
 * WalletConnect/embedded). Konek buka modal Dynamic; dropdown tampilkan owner + agent.
 */
export function WalletButton() {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const t = useT();
  const router = useRouter();
  const addr = primaryWallet?.address ?? null;
  const [agent, setAgent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"owner" | "agent" | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Tutup dropdown saat klik/tap di luar — pakai listener dokumen (andal lintas
  // stacking-context; overlay `fixed` bisa ketiban konten halaman & telan klik).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Agent wallet (kalau sesi SIWE ada) untuk ditampilkan di dropdown.
  useEffect(() => {
    if (!addr) {
      setAgent(null);
      return;
    }
    fetch("/api/agent")
      .then((r) => r.json())
      .then((j: { agent?: string | null }) => setAgent(j.agent ?? null))
      .catch(() => {});
  }, [addr]);

  const copy = (which: "owner" | "agent", value: string) =>
    navigator.clipboard?.writeText(value).then(() => {
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    });

  const disconnect = async () => {
    setOpen(false);
    try {
      await handleLogOut();
    } catch {
      /* ignore */
    }
    try {
      await signOutAction();
    } catch {
      /* mungkin tak ada sesi */
    }
    router.refresh();
  };

  if (!addr) {
    return (
      <button
        type="button"
        onClick={() => setShowAuthFlow(true)}
        className="rounded-lg bg-ink px-3 py-1.5 text-sm font-medium text-white"
      >
        {t("Connect wallet")}
      </button>
    );
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-line/60 bg-white px-2.5 py-1.5 text-sm font-medium hover:bg-shade"
      >
        <GeneratedAvatar name={addr} size={22} />
        {short(addr)}
      </button>
      {open && (
          <div className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-line/60 bg-white shadow-xl">
            <div className="flex items-center gap-3 p-4">
              <GeneratedAvatar name={addr} size={44} />
              <div className="min-w-0">
                <div className="truncate font-mono text-base font-semibold">{short(addr)}</div>
                <div className="flex items-center gap-1.5 text-xs text-soft">
                  <ChainIcon size={14} />
                  {ACTIVE_CHAIN.name}
                </div>
              </div>
            </div>

            {agent && (
              <div className="border-t border-line/60 px-4 py-3 text-xs">
                <div className="flex items-center justify-between text-soft">
                  <span>{t("Agent (deposit)")}</span>
                  <button type="button" onClick={() => copy("agent", agent)} className="hover:text-ink">
                    {copied === "agent" ? t("copied ✓") : t("copy")}
                  </button>
                </div>
                <div className="mt-0.5 font-mono">{short(agent)}</div>
              </div>
            )}

            <div className="border-t border-line/60 p-2">
              <button
                type="button"
                onClick={() => copy("owner", addr)}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-shade"
              >
                {copied === "owner" ? t("Address copied ✓") : t("Copy Address")}
              </button>
              <button
                type="button"
                onClick={disconnect}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-shade"
              >
                {t("Disconnect Wallet")}
              </button>
            </div>
          </div>
      )}
    </div>
  );
}
