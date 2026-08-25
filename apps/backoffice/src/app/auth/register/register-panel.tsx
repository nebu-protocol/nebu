"use client";

import { useActionState } from "react";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAction } from "@/server/auth-actions";

import { TurnstileWidget } from "../turnstile-widget";

export function RegisterPanel({ siteKey }: { siteKey: string | null }) {
  const [error, formAction, pending] = useActionState(registerAction, null);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image src="/lp-logo.png" alt="LP Bot" width={48} height={48} className="rounded-xl" />
        <h1 className="text-xl font-semibold">Daftar LP Bot</h1>
        <p className="text-muted-foreground text-sm">Akun member — kelola wallet sendiri & ikut menjalankan bot</p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          required
          autoFocus
          pattern="[a-zA-Z0-9_.\-]{3,32}"
          title="3–32 karakter: huruf, angka, _ . -"
          className="h-11"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="h-11"
        />
        <span className="text-muted-foreground text-xs">Minimal 8 karakter.</span>
      </div>

      <TurnstileWidget siteKey={siteKey} />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Memproses…" : "Daftar"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Sudah punya akun?{" "}
        <Link href="/auth/login" className="text-primary hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  );
}
