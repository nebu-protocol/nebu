"use client";

import { useActionState } from "react";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/server/auth-actions";

import { TurnstileWidget } from "../turnstile-widget";

export function LoginPanel({ siteKey }: { siteKey: string | null }) {
  const [error, formAction, pending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image src="/lp-logo.png" alt="LP Bot" width={48} height={48} className="rounded-xl" />
        <h1 className="font-semibold text-xl">LP Bot</h1>
        <p className="text-muted-foreground text-sm">Masuk untuk mengakses dashboard</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input id="username" name="username" autoComplete="username" required autoFocus className="h-11" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
        />
      </div>

      <TurnstileWidget siteKey={siteKey} />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Memproses…" : "Masuk"}
      </Button>

      <p className="text-center text-muted-foreground text-sm">
        Belum punya akun?{" "}
        <Link href="/auth/register" className="text-primary hover:underline">
          Daftar
        </Link>
      </p>
    </form>
  );
}
