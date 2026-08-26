"use client";

import { useState } from "react";

const KNOWN = new Set(["eth", "weth", "usdc", "usdt", "wbtc"]);

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Logo token: avatar generatif (gradien + inisial) SELALU jadi lapisan dasar, lalu
 * logo asli di-overlay kalau ketemu. Urutan sumber: file pra-unduh → proxy runtime
 * (/api/token-logo, "selalu cek" tiap token pools dari Blockscout/DexScreener). Tak
 * pernah ada gambar rusak/blank — kalau semua gagal, avatar dasar yang tampil.
 */
export function TokenIcon({
  symbol,
  address,
  size = 28,
}: {
  symbol: string;
  address?: string | null;
  size?: number;
}) {
  const s = symbol.toLowerCase();
  const addr = address?.toLowerCase();
  const candidates = [
    addr ? `/tokens/${addr}.png` : null,
    KNOWN.has(s) ? `/tokens/${s === "weth" ? "eth" : s}.png` : null,
    addr ? `/api/token-logo/${addr}` : null,
  ].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const src = candidates[idx];

  const h = hash(s || addr || "?");
  const hue = h % 360;
  const hue2 = (hue + 40) % 360;
  const initial = symbol.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";

  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${hue} 65% 52%), hsl(${hue2} 70% 40%))`,
      }}
    >
      {initial}
      {src && (
        // biome-ignore lint/performance/noImgElement: static/proxied token logo, tiny
        <img
          src={src}
          alt={symbol}
          onError={() => setIdx((i) => i + 1)}
          className="absolute inset-0 h-full w-full rounded-full object-cover"
        />
      )}
    </span>
  );
}
