import type { Metadata } from "next";

import { turnstileSiteKey } from "@/server/turnstile";

import { RegisterPanel } from "./register-panel";

export const metadata: Metadata = { title: "Daftar" };
export const dynamic = "force-dynamic"; // baca TURNSTILE_SITE_KEY saat runtime

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <RegisterPanel siteKey={turnstileSiteKey()} />
    </div>
  );
}
