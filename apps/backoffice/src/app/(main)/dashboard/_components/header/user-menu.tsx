"use client";

import { LogOut } from "lucide-react";

import { GeneratedAvatar } from "@/components/generated-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logoutAction } from "@/server/auth-actions";

export function UserMenu({ username, role }: { username: string; role: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-md py-1 pr-1 pl-2 transition-colors hover:bg-accent"
        >
          <span className="hidden font-medium text-sm sm:inline">{username}</span>
          <GeneratedAvatar name={username} size={28} className="size-7" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="min-w-52 rounded-lg">
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <GeneratedAvatar name={username} size={32} className="size-8 rounded-lg" />
            <div className="grid flex-1 leading-tight">
              <span className="truncate font-medium">{username}</span>
              <span className="truncate text-muted-foreground text-xs capitalize">{role}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
