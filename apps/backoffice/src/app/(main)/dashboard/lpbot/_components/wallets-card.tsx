"use client";

import { useState } from "react";

import { KeyRound, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LpWallet } from "@/server/lpbot";
import { addLpbotWallet, deleteLpbotWallet, updateLpbotWallet } from "@/server/lpbot-wallet-actions";

export function WalletsCard({ wallets }: { wallets: LpWallet[] }) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5" /> Automation Wallets
        </CardTitle>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> Add Wallet
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form action={addLpbotWallet} onSubmit={() => setAddOpen(false)}>
              <DialogHeader>
                <DialogTitle>Add Wallet</DialogTitle>
                <DialogDescription>
                  Private key dienkripsi (AES-256-GCM) sebelum disimpan. Kosongkan untuk generate wallet baru. Gunakan
                  wallet burner, bukan wallet utama.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="burner-1" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="privateKey">Private Key (opsional)</Label>
                  <Input
                    id="privateKey"
                    name="privateKey"
                    type="password"
                    autoComplete="off"
                    placeholder="0x… — kosong = generate baru"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Save</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {wallets.length === 0 ? (
          <p className="text-muted-foreground text-sm">Belum ada wallet. Tambah satu untuk mengaktifkan automation.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Wallet</TableHead>
                <TableHead>Fund (ETH) · Max/Pool · Automation · Auto-swap</TableHead>
                <TableHead className="text-right">Remove</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((w) => (
                <TableRow key={w.address}>
                  <TableCell className="align-top">
                    <div className="font-medium">{w.name}</div>
                    <div className="font-mono text-muted-foreground text-xs">
                      {w.address.slice(0, 10)}…{w.address.slice(-6)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <form action={updateLpbotWallet} className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="address" value={w.address} />
                      <span className="flex items-center gap-1.5 text-xs">
                        Fund
                        <Input
                          name="fundEth"
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={w.fund_eth}
                          className="w-24"
                        />
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
                  <TableCell className="text-right align-top">
                    <form action={deleteLpbotWallet}>
                      <input type="hidden" name="address" value={w.address} />
                      <Button type="submit" size="icon" variant="ghost">
                        <Trash2 className="text-destructive" />
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
