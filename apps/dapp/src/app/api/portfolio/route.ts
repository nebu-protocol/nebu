import { NextResponse } from "next/server";

import { getWalletPnlSeries, getWalletPortfolio, getWalletPositions } from "@/lib/lpdata";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { address, token } — token Turnstile diverifikasi (anti-bot) sebelum data dibalikkan. */
export async function POST(req: Request) {
  let body: { address?: string; token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const address = String(body.address ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  return NextResponse.json({
    portfolio: getWalletPortfolio(address),
    series: getWalletPnlSeries(address),
    positions: getWalletPositions(address),
  });
}
