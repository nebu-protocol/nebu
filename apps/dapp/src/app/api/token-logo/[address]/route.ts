import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 604800; // 7 hari

/** Cari URL logo token dari sumber publik (server-side; CSP client tak kena). */
async function findLogoUrl(addr: string): Promise<string | null> {
  // 1. Blockscout (explorer chain) — sumber paling relevan utk Robinhood Chain.
  try {
    const r = await fetch(`https://robinhoodchain.blockscout.com/api/v2/tokens/${addr}`, {
      next: { revalidate: 86400 },
    });
    if (r.ok) {
      const j = (await r.json()) as { icon_url?: string | null };
      if (j.icon_url) return j.icon_url;
    }
  } catch {
    /* lanjut sumber lain */
  }
  // 2. DexScreener — sebagian pair punya info.imageUrl.
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addr}`, {
      next: { revalidate: 86400 },
    });
    if (r.ok) {
      const j = (await r.json()) as { pairs?: { info?: { imageUrl?: string } }[] };
      const img = j.pairs?.find((p) => p.info?.imageUrl)?.info?.imageUrl;
      if (img) return img;
    }
  } catch {
    /* nyerah → 404 */
  }
  return null;
}

/**
 * Proxy logo token by address. Cek sumber publik on-demand → "selalu cek" tiap token
 * yang muncul di list pools tanpa perlu pra-unduh + rebuild. 404 kalau tak ada logo di
 * mana pun (client fallback ke avatar generatif). Stream balik + cache lama.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const addr = address?.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(addr)) return new NextResponse(null, { status: 400 });

  const url = await findLogoUrl(addr);
  if (!url) return new NextResponse(null, { status: 404 });
  try {
    const img = await fetch(url, { next: { revalidate: 604800 } });
    if (!img.ok || !img.body) return new NextResponse(null, { status: 404 });
    return new NextResponse(await img.arrayBuffer(), {
      headers: {
        "content-type": img.headers.get("content-type") ?? "image/png",
        "cache-control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
