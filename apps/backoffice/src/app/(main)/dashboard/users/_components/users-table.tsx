"use client";

import { useState } from "react";

import { Ban, CircleCheck, Plus, Trash2 } from "lucide-react";

import { GeneratedAvatar } from "@/components/generated-avatar";
import { Badge } from "@/components/ui/badge";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { LpUser } from "@/server/users";
import { createUserAction, deleteUserAction, setUserRoleAction, toggleBlockAction } from "@/server/users-actions";

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  member: "secondary",
  viewer: "outline",
};

export function UsersTable({ users, currentUser }: { users: LpUser[]; currentUser: string }) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{users.length} user</CardTitle>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus /> Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form action={createUserAction} onSubmit={() => setAddOpen(false)}>
              <DialogHeader>
                <DialogTitle>Add User</DialogTitle>
                <DialogDescription>Buat akun baru dengan role tertentu.</DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" name="username" required pattern="[a-zA-Z0-9_.\-]{3,32}" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" name="password" type="password" required minLength={8} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="role">Role</Label>
                  <select
                    id="role"
                    name="role"
                    defaultValue="viewer"
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                  >
                    <option value="viewer">viewer</option>
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Create</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Wallets</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const self = u.username === currentUser;
              return (
                <TableRow key={u.username}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <GeneratedAvatar name={u.username} size={28} className="size-7" />
                      <span className="font-medium">{u.username}</span>
                      {self && <span className="text-muted-foreground text-xs">(kamu)</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <form action={setUserRoleAction} className="flex items-center gap-2">
                      <input type="hidden" name="username" value={u.username} />
                      <Badge variant={ROLE_VARIANT[u.role] ?? "outline"}>{u.role}</Badge>
                      <select
                        name="role"
                        defaultValue={u.role}
                        onChange={(e) => e.currentTarget.form?.requestSubmit()}
                        disabled={self}
                        className="h-8 rounded-md border border-input bg-transparent px-2 text-xs disabled:opacity-50"
                      >
                        <option value="viewer">viewer</option>
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                      </select>
                    </form>
                  </TableCell>
                  <TableCell>{u.wallet_count}</TableCell>
                  <TableCell>
                    {u.blocked === 1 ? (
                      <Badge variant="destructive">Blocked</Badge>
                    ) : (
                      <Badge variant="outline">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <form action={toggleBlockAction}>
                        <input type="hidden" name="username" value={u.username} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          disabled={self}
                          title={u.blocked === 1 ? "Buka blokir" : "Blokir"}
                        >
                          {u.blocked === 1 ? <CircleCheck className="size-3.5" /> : <Ban className="size-3.5" />}
                          {u.blocked === 1 ? "Unblock" : "Block"}
                        </Button>
                      </form>
                      <form action={deleteUserAction}>
                        <input type="hidden" name="username" value={u.username} />
                        <Button type="submit" size="icon" variant="ghost" disabled={self} title="Hapus">
                          <Trash2 className="text-destructive" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
