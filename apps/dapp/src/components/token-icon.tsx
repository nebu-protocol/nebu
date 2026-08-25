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
 * Logo token dari file lokal yang sudah diunduh (public/tokens/{address}.png),
 * lalu logo token utama, terakhir ikon generatif. onError menjaga tak ada gambar rusak.
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
  const candidates = [
    address ? `/tokens/${address.toLowerCase()}.png` : null,
    KNOWN.has(s) ? `/tokens/${s === "weth" ? "eth" : s}.png` : null,
  ].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);

  const src = candidates[idx];
  if (src) {
    // biome-ignore lint/performance/noImgElement: static token logo, tiny
    return (
      <img
        src={src}
        alt={symbol}
        onError={() => setIdx((i) => i + 1)}
        className="shrink-0 rounded-full bg-shade object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  const hue = hash(s) % 360;
  const initial = symbol.replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 60% 45%)`, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}
