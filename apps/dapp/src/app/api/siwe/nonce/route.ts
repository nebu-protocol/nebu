import { NextResponse } from "next/server";

import { issueNonce, siweMessage } from "@/server/siwe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { address } -> { message } untuk ditandatangani wallet. */
export async function POST(req: Request) {
  let body: { address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const address = String(body.address ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const nonce = await issueNonce();
  return NextResponse.json({ message: siweMessage(address, nonce) });
}
