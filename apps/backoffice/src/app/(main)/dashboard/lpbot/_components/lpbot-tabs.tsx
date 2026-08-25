"use client";

import { Activity, KeyRound, Target, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LpDecision, LpExecution, LpPositionPnl, LpWallet, LpYieldRow } from "@/server/lpbot";

import { WalletsCard } from "./wallets-card";

const ACTION_VARIANT = {
  ENTER: "default",
  HOLD: "secondary",
  EXIT: "destructive",
} as const;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  CONFIRMED: "default",
  SENT: "secondary",
  SIMULATED: "outline",
  DRY_RUN: "outline",
  FAILED: "destructive",
};

const KIND_LABEL: Record<string, string> = {
  SWAP_IN: "swap",
  MINT: "mint LP",
  BURN: "close LP",
};

const pos = (n: number) => (n >= 0 ? "+" : "");
const netClass = (n: number) => (n >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive");

type Props = {
  decisions: LpDecision[];
  pnl: LpPositionPnl[];
  yields: LpYieldRow[];
  wallets: LpWallet[];
  executions: LpExecution[];
  canManageWallets: boolean;
};

export function LpbotTabs({ decisions, pnl, yields, wallets, executions, canManageWallets }: Props) {
  const activeWallets = wallets.filter((w) => w.automation === 1).length;

  return (
    <Tabs defaultValue="positions" className="gap-4">
      <TabsList variant="line" className="w-full justify-start">
        <TabsTrigger value="positions">
          <TrendingUp data-icon="inline-start" /> Positions
        </TabsTrigger>
        <TabsTrigger value="opportunities">
          <Target data-icon="inline-start" /> Opportunities
          <Badge variant="secondary" className="ml-1">
            {yields.length}
          </Badge>
        </TabsTrigger>
        {canManageWallets && (
          <TabsTrigger value="wallets">
            <KeyRound data-icon="inline-start" /> Wallets
            {activeWallets > 0 && <Badge className="ml-1">{activeWallets}</Badge>}
          </TabsTrigger>
        )}
        <TabsTrigger value="activity">
          <Activity data-icon="inline-start" /> Activity
        </TabsTrigger>
      </TabsList>

      {/* POSITIONS: apa yang bot putuskan + performa vs HODL */}
      <TabsContent value="positions" className="flex flex-col gap-4">
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-medium text-sm">Strategist Decisions</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Belum ada keputusan — tunggu siklus collector berikutnya.
                    </TableCell>
                  </TableRow>
                )}
                {decisions.map((d) => (
                  <TableRow key={d.pool_id}>
                    <TableCell>
                      <Badge variant={ACTION_VARIANT[d.action]}>{d.action}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{d.pair ?? "?"}</span>{" "}
                      <span className="font-mono text-muted-foreground text-xs">{d.pool_id.slice(0, 10)}…</span>
                    </TableCell>
                    <TableCell>{(d.size_fraction * 100).toFixed(0)}%</TableCell>
                    <TableCell>±{((d.width_factor - 1) * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{d.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-medium text-sm">
              PnL vs HODL <span className="font-normal text-muted-foreground">(simulated)</span>
            </h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Hold (d)</TableHead>
                  <TableHead className="text-right">Δ Price</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                  <TableHead className="text-right">IL</TableHead>
                  <TableHead className="text-right">Net vs HODL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pnl.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      Belum ada posisi dengan ≥2 snapshot. Collector perlu jalan beberapa jam setelah ENTER pertama.
                    </TableCell>
                  </TableRow>
                )}
                {pnl.map((p) => (
                  <TableRow key={p.pool_id}>
                    <TableCell className="font-medium">{p.pair}</TableCell>
                    <TableCell className="text-right">{p.holding_days.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {pos(p.price_change_pct)}
                      {p.price_change_pct.toFixed(1)}%
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 dark:text-emerald-400">
                      +{p.fees_pct.toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right text-destructive">{p.il_pct.toFixed(2)}%</TableCell>
                    <TableCell className={`text-right font-medium ${netClass(p.net_pct)}`}>
                      {pos(p.net_pct)}
                      {p.net_pct.toFixed(2)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* OPPORTUNITIES: pool kandidat */}
      <TabsContent value="opportunities">
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-sm">Top Yield Pools</h3>
              <span className="text-muted-foreground text-xs">gross APR, pre-IL</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pair</TableHead>
                  <TableHead className="text-right">Age (d)</TableHead>
                  <TableHead className="text-right">APR ±20%</TableHead>
                  <TableHead className="text-right">APR ±5%</TableHead>
                  <TableHead className="text-right">Fee/ETH/day</TableHead>
                  <TableHead className="text-right">Vol (ETH/win)</TableHead>
                  <TableHead className="text-right">Swaps/h</TableHead>
                  <TableHead>Hook</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {yields.map((y) => (
                  <TableRow key={y.pool_id}>
                    <TableCell className="font-medium">{y.pair}</TableCell>
                    <TableCell className="text-right">{y.age_days?.toFixed(1) ?? "?"}</TableCell>
                    <TableCell className="text-right">{y.apr20.toFixed(0)}%</TableCell>
                    <TableCell className="text-right">{y.apr5.toFixed(0)}%</TableCell>
                    <TableCell className="text-right">{y.fee_per_eth_day.toFixed(5)}</TableCell>
                    <TableCell className="text-right">{y.vol_eth?.toFixed(1) ?? "-"}</TableCell>
                    <TableCell className="text-right">{y.swaps_per_h.toFixed(0)}</TableCell>
                    <TableCell>
                      {y.hook === "-" ? (
                        <span className="text-muted-foreground">none</span>
                      ) : (
                        <Badge variant="outline" className="font-mono text-xs">
                          {y.hook}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* WALLETS */}
      {canManageWallets && (
        <TabsContent value="wallets">
          <WalletsCard wallets={wallets} />
        </TabsContent>
      )}

      {/* ACTIVITY */}
      <TabsContent value="activity">
        <Card>
          <CardContent className="pt-6">
            <h3 className="mb-3 font-medium text-sm">Recent Executions</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kind</TableHead>
                  <TableHead>Pool</TableHead>
                  <TableHead className="text-right">Amount (ETH)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground">
                      Belum ada eksekusi. Aktifkan automation + auto-swap pada wallet (mode simulasi sampai
                      EXECUTOR_LIVE=1).
                    </TableCell>
                  </TableRow>
                )}
                {executions.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{KIND_LABEL[e.kind] ?? e.kind}</TableCell>
                    <TableCell className="font-mono text-xs">{e.pool_id.slice(0, 12)}…</TableCell>
                    <TableCell className="text-right">{e.amount_eth?.toFixed(4) ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[e.status] ?? "outline"}>{e.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground text-xs">{e.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
