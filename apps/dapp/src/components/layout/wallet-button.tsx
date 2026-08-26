"use client";

import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { GeneratedAvatar } from "@/components/generated-avatar";
import { signOutAction } from "@/server/wallet-actions";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Tombol Wallet navbar via Dynamic.xyz — dukung BANYAK wallet + mobile (deeplink/
 * WalletConnect/embedded). Konek buka modal Dynamic; dropdown tampilkan owner + agent.
 */
export function WalletButton() {
  const { primaryWallet, setShowAuthFlow, handleLogOut } = useDynamicContext();
  const router = useRouter();
  const addr = primaryWallet?.address ?? null;
  const [agent, setAgent] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"owner" | "agent" | null>(null);

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
        Connect wallet
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-line/60 bg-white px-2.5 py-1.5 text-sm font-medium hover:bg-shade"
      >
        <GeneratedAvatar name={addr} size={22} />
        {short(addr)}
      </button>
      {open && (
        <>
          <button type="button" aria-label="close" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-line/60 bg-white shadow-xl">
            <div className="flex items-center gap-3 p-4">
              <GeneratedAvatar name={addr} size={44} />
              <div className="min-w-0">
                <div className="truncate font-mono text-base font-semibold">{short(addr)}</div>
                <div className="flex items-center gap-1.5 text-xs text-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/robinhood-chain.png" alt="" className="h-3.5 w-3.5 rounded-full" />
                  Robinhood Chain
                </div>
              </div>
            </div>

            {agent && (
              <div className="border-t border-line/60 px-4 py-3 text-xs">
                <div className="flex items-center justify-between text-soft">
                  <span>Agent (deposit)</span>
                  <button type="button" onClick={() => copy("agent", agent)} className="hover:text-ink">
                    {copied === "agent" ? "copied ✓" : "copy"}
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
                {copied === "owner" ? "Address copied ✓" : "Copy Address"}
              </button>
              <button
                type="button"
                onClick={disconnect}
                className="w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-shade"
              >
                Disconnect Wallet
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
