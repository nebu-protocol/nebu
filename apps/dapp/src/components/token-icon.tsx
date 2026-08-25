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
 * Logo token: coba logo asli (iconUrl Blockscout) lalu logo lokal token utama.
 * Kalau gambar gagal dimuat (URL rusak/404), jatuh ke ikon generatif — jadi
 * tidak pernah menampilkan gambar rusak.
 */
export function TokenIcon({
  symbol,
  iconUrl,
  size = 28,
}: {
  symbol: string;
  iconUrl?: string | null;
  size?: number;
}) {
  const s = symbol.toLowerCase();
  const src = iconUrl ?? (KNOWN.has(s) ? `/tokens/${s === "weth" ? "eth" : s}.png` : null);
  const [failed, setFailed] = useState(false);

  if (src && !failed) {
    // biome-ignore lint/performance/noImgElement: remote/static token logo, tiny
    return (
      <img
        src={src}
        alt={symbol}
        width={size}
        height={size}
        onError={() => setFailed(true)}
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
