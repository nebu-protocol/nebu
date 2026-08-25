import { NextResponse } from "next/server";

import { verifySiwe } from "@/server/siwe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { address, signature, token } — verifikasi Turnstile + signature, set sesi SIWE. */
export async function POST(req: Request) {
  let body: { address?: string; signature?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const sig = String(body.signature ?? "");
  if (!/^0x[0-9a-fA-F]+$/.test(sig)) return NextResponse.json({ error: "signature invalid" }, { status: 400 });
  const ok = await verifySiwe(String(body.address ?? ""), sig as `0x${string}`);
  if (!ok) return NextResponse.json({ error: "verifikasi tanda tangan gagal" }, { status: 401 });
  return NextResponse.json({ ok: true });
}
