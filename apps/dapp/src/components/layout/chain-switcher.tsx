"use client";

import { isEthereumWallet } from "@dynamic-labs/ethereum";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useEffect, useRef, useState } from "react";

import { BnbIcon } from "@/components/icons";
import { ACTIVE_CHAIN } from "@/lib/chain";

// Nebu = BNB-only (samakan dgn providers evmNetworks). Klik → pastikan wallet di BSC.
const CHAINS = [{ id: 56, name: "BNB Smart Chain", kind: "bsc" as const }];

function Mark({ kind, size = 18 }: { kind: "bsc" | "robinhood"; size?: number }) {
  if (kind === "bsc") return <BnbIcon size={size} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/robinhood-chain.png" alt="" width={size} height={size} className="rounded-full" />;
}

/**
 * Badge chain di header = tombol switch jaringan. Klik → dropdown daftar chain; pilih →
 * wallet Dynamic switchNetwork. Tanpa wallet connect: tampil chain aktif (config) statis.
 */
export function ChainSwitcher() {
  const { primaryWallet } = useDynamicContext();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (primaryWallet && isEthereumWallet(primaryWallet)) {
        try {
          const n = await primaryWallet.getNetwork();
          if (alive) setCurrent(typeof n === "number" ? n : Number(n));
        } catch {
          /* biarkan null → fallback config */
        }
      } else if (alive) setCurrent(null);
    })();
    return () => {
      alive = false;
    };
  }, [primaryWallet]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const switchTo = async (id: number) => {
    if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await primaryWallet.switchNetwork(id);
      setCurrent(id);
    } catch {
      /* user tolak / gagal — biarkan */
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  // Chain yang ditampilkan: wallet terkoneksi → chain wallet; else default config.
  const active = CHAINS.find((c) => c.id === current) ?? CHAINS.find((c) => c.id === ACTIVE_CHAIN.id) ?? CHAINS[0]!;

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        type="button"
        title={active.name}
        aria-label={`Network: ${active.name}`}
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border border-line/60 hover:bg-shade disabled:opacity-60 ${open ? "bg-shade" : ""}`}
      >
        <Mark kind={active.kind} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-line/60 bg-white p-1.5 shadow-xl">
          <div className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Network</div>
          {CHAINS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => switchTo(c.id)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm ${
                c.id === active.id ? "bg-shade font-medium text-ink" : "text-soft hover:bg-shade hover:text-ink"
              }`}
            >
              <Mark kind={c.kind} size={16} />
              <span className="flex-1">{c.name}</span>
              {c.id === active.id && <span className="text-emerald-600">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
