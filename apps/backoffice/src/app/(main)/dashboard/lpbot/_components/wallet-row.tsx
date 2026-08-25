"use client";

import { useState } from "react";

import { Play, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import type { LpWallet } from "@/server/lpbot";
import { deleteLpbotWallet, executeNowAction, updateLpbotWallet } from "@/server/lpbot-wallet-actions";

const fmtUsd = (n: number) =>
  n >= 1 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `$${n.toFixed(2)}`;

export function WalletRow({
  wallet,
  balanceWei,
  ethUsd,
}: {
  wallet: LpWallet;
  balanceWei: string | undefined;
  ethUsd: number | null;
}) {
  const w = wallet;
  const balanceEth = balanceWei ? Number(BigInt(balanceWei)) / 1e18 : null;

  // Fund selalu DISIMPAN sebagai ETH; input bisa USD (dikonversi saat submit).
  const [ccy, setCcy] = useState<"ETH" | "USD">("ETH");
  const [fund, setFund] = useState(String(w.fund_eth));

  const toEth = (val: string) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return 0;
    return ccy === "USD" && ethUsd ? n / ethUsd : n;
  };
  const fundEth = toEth(fund);

  const setMax = () => {
    if (balanceEth === null) return;
    setFund(ccy === "USD" && ethUsd ? (balanceEth * ethUsd).toFixed(2) : balanceEth.toFixed(4));
  };

  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="font-medium">
          {w.name}
          {w.owner && <span className="text-muted-foreground ml-1 text-xs">· {w.owner}</span>}
        </div>
        <div className="font-mono text-muted-foreground text-xs">
          {w.address.slice(0, 10)}…{w.address.slice(-6)}
        </div>
        <div className="text-muted-foreground mt-0.5 text-xs">
          {balanceEth === null
            ? "balance —"
            : `${balanceEth.toFixed(4)} ETH${ethUsd ? ` · ${fmtUsd(balanceEth * ethUsd)}` : ""}`}
        </div>
      </TableCell>
      <TableCell>
        <form action={updateLpbotWallet} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="address" value={w.address} />
          <input type="hidden" name="fundEth" value={fundEth} />
          <span className="flex items-center gap-1.5 text-xs">
            Fund
            <Input
              type="number"
              step="0.01"
              min="0"
              value={fund}
              onChange={(e) => setFund(e.target.value)}
              className="w-24"
            />
            <button
              type="button"
              onClick={() => setCcy((c) => (c === "ETH" ? "USD" : "ETH"))}
              className="hover:bg-accent rounded border px-1.5 py-0.5 text-xs"
              title="Ganti unit"
            >
              {ccy}
            </button>
            <button
              type="button"
              onClick={setMax}
              disabled={balanceEth === null}
              className="hover:bg-accent rounded border px-1.5 py-0.5 text-xs disabled:opacity-50"
            >
              Max
            </button>
            {ethUsd && ccy === "ETH" && fundEth > 0 && (
              <span className="text-muted-foreground">≈ {fmtUsd(fundEth * ethUsd)}</span>
            )}
            {ethUsd && ccy === "USD" && fundEth > 0 && (
              <span className="text-muted-foreground">≈ {fundEth.toFixed(4)} ETH</span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            Max/pool
            <Input
              name="maxPerPoolEth"
              type="number"
              step="0.01"
              min="0"
              defaultValue={w.max_per_pool_eth}
              className="w-24"
            />
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <Switch name="automation" defaultChecked={w.automation === 1} /> automation
          </span>
          <span className="flex items-center gap-1.5 text-xs">
            <Switch name="autoswap" defaultChecked={w.autoswap === 1} /> auto-swap
          </span>
          <Button type="submit" size="sm" variant="outline">
            Save
          </Button>
        </form>
      </TableCell>
      <TableCell className="align-top">
        <form action={executeNowAction}>
          <Button
            type="submit"
            size="sm"
            disabled={w.has_entered === 1 || w.automation === 0 || w.fund_eth === 0}
            title={
              w.has_entered === 1
                ? "Sudah masuk posisi"
                : w.automation === 0
                  ? "Aktifkan automation dulu"
                  : w.fund_eth === 0
                    ? "Set fund dulu"
                    : "Jalankan executor sekarang"
            }
          >
            <Play className="size-3.5" />
            {w.has_entered === 1 ? "Entered" : "Execute"}
          </Button>
        </form>
      </TableCell>
      <TableCell className="text-right align-top">
        <form action={deleteLpbotWallet}>
          <input type="hidden" name="address" value={w.address} />
          <Button type="submit" size="icon" variant="ghost">
            <Trash2 className="text-destructive" />
          </Button>
        </form>
      </TableCell>
    </TableRow>
  );
}
