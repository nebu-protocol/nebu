import { NextResponse } from "next/server";

import { getLpbotSummary } from "@/server/lpbot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(getLpbotSummary());
  } catch (error) {
    return NextResponse.json(
      { error: `lp.db tidak terbaca — pastikan bot pernah jalan: ${String(error)}` },
      { status: 503 },
    );
  }
}
