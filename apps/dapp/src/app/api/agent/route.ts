import { NextResponse } from "next/server";

import { getOwnedWallet } from "@/server/wallet-actions";

export const dynamic = "force-dynamic";

/** Agent wallet milik sesi SIWE saat ini (untuk ditampilkan di dropdown wallet). */
export async function GET() {
  try {
    const w = await getOwnedWallet();
    return NextResponse.json({ agent: w?.address ?? null });
  } catch {
    return NextResponse.json({ agent: null });
  }
}
