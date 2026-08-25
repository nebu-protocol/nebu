import Image from "next/image";

import { formatDistanceToNow } from "date-fns";
import { Pause, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getSession } from "@/server/auth";
import { getLpbotExecutions, getLpbotPnl, getLpbotSummary, getLpbotWallets, type LpbotSummary } from "@/server/lpbot";
import { toggleLpbotPause } from "@/server/lpbot-actions";

import { LpbotTabs } from "./_components/lpbot-tabs";

export const dynamic = "force-dynamic";

export default async function Page() {
  const session = await getSession();
  const currentUser = session?.username ?? null;
  const role = session?.role ?? "viewer";
  const isAdmin = role === "admin";
  let summary: LpbotSummary | null = null;
  let loadError: string | null = null;
  try {
    summary = getLpbotSummary();
  } catch (error) {
    loadError = String(error);
  }

  if (!summary) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl tracking-tight">LP Bot</h1>
        <Card>
          <CardContent className="pt-6 text-muted-foreground text-sm">
            Database bot belum terbaca (jalankan collector di apps/bot dulu). {loadError}
          </CardContent>
        </Card>
      </div>
    );
  }

  const { stats, yields, decisions } = summary;
  const wallets = getLpbotWallets({ role, username: currentUser ?? "" });
  const executions = getLpbotExecutions();
  const pnl = getLpbotPnl();
  const avgNet = pnl.length ? pnl.reduce((s, p) => s + p.net_pct, 0) / pnl.length : null;
  const winners = pnl.filter((p) => p.net_pct > 0).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl tracking-tight">
            <Image src="/lp-logo.png" alt="LP Bot" width={28} height={28} className="size-7 rounded-md" />
            LP Bot
            <Badge variant={stats.paused ? "destructive" : "default"} className="ml-1">
              {stats.paused ? "PAUSED" : "RUNNING"}
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm">
            Robinhood Chain ·{" "}
            {stats.lastComputedAt
              ? `updated ${formatDistanceToNow(stats.lastComputedAt * 1000, { addSuffix: true })}`
              : "belum ada data"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {currentUser && (
            <span className="text-muted-foreground hidden text-sm sm:inline">
              {currentUser} · {role}
            </span>
          )}
          {isAdmin && (
            <form action={toggleLpbotPause}>
              <Button variant={stats.paused ? "default" : "destructive"}>
                {stats.paused ? <Play /> : <Pause />}
                {stats.paused ? "Resume Bot" : "Pause Bot"}
              </Button>
            </form>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active Pools" value={stats.activePools.toLocaleString()} />
        <Stat label="Passing Guards" value={String(yields.length)} hint="lolos filter" />
        <Stat
          label="Avg Net vs HODL"
          value={avgNet === null ? "—" : `${avgNet >= 0 ? "+" : ""}${avgNet.toFixed(1)}%`}
          hint={avgNet === null ? "menunggu data" : `${winners}/${pnl.length} beat HODL`}
          tone={avgNet === null ? "muted" : avgNet >= 0 ? "up" : "down"}
        />
        <Stat
          label="Automation Wallets"
          value={String(wallets.filter((w) => w.automation === 1).length)}
          hint={`dari ${wallets.length} total`}
        />
      </div>

      <LpbotTabs
        decisions={decisions}
        pnl={pnl}
        yields={yields}
        wallets={wallets}
        executions={executions}
        canManageWallets={role !== "viewer"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "muted",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "muted" | "up" | "down";
}) {
  const valueClass =
    tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-destructive" : "";
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className={`font-semibold text-2xl ${valueClass}`}>{value}</span>
        {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
      </CardContent>
    </Card>
  );
}
