import { NextResponse } from "next/server";

import { verifySiwe } from "@/server/siwe";
import { verifyTurnstile } from "@/server/turnstile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { address, signature, token } — verifikasi Turnstile (kalau dikonfigurasi) LALU
 * signature SIWE, baru set sesi. SIWE tetap gate utama; Turnstile = anti-bot lapis tambahan
 * (no-op kalau TURNSTILE_SECRET_KEY kosong).
 */
export async function POST(req: Request) {
  let body: { address?: string; signature?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyTurnstile(String(body.token ?? ""), ip)))
    return NextResponse.json({ error: "verifikasi bot gagal" }, { status: 403 });
  const sig = String(body.signature ?? "");
  if (!/^0x[0-9a-fA-F]+$/.test(sig)) return NextResponse.json({ error: "signature invalid" }, { status: 400 });
  const ok = await verifySiwe(String(body.address ?? ""), sig as `0x${string}`);
  if (!ok) return NextResponse.json({ error: "verifikasi tanda tangan gagal" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
