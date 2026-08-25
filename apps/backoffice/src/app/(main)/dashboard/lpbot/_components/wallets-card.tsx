"use client";

import { useState } from "react";

import { KeyRound, Plus } from "lucide-react";

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
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LpWallet } from "@/server/lpbot";
import { addLpbotWallet } from "@/server/lpbot-wallet-actions";

import { WalletRow } from "./wallet-row";

export function WalletsCard({
  wallets,
  balances,
  ethUsd,
}: {
  wallets: LpWallet[];
  balances: Record<string, string>;
  ethUsd: number | null;
}) {
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
                <TableHead>Run</TableHead>
                <TableHead className="text-right">Remove</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((w) => (
                <WalletRow key={w.address} wallet={w} balanceWei={balances[w.address]} ethUsd={ethUsd} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
