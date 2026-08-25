import { redirect } from "next/navigation";

import { Users } from "lucide-react";

import { getSession } from "@/server/auth";
import { listUsers } from "@/server/users";

import { UsersTable } from "./_components/users-table";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");
  if (session.role !== "admin") redirect("/dashboard/lpbot");

  const users = listUsers();

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl tracking-tight">
          <Users className="size-6" /> Users
        </h1>
        <p className="text-muted-foreground text-sm">
          Kelola akun: role (viewer/member/admin), blokir, reset password.
        </p>
      </div>
      <UsersTable users={users} currentUser={session.username} />
    </div>
  );
}
