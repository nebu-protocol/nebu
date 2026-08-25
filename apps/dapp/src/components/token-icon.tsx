const KNOWN = new Set(["eth", "weth", "usdc", "usdt", "wbtc"]);

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/** Logo token kalau dikenal (public/tokens), selain itu ikon generatif per-simbol. */
export function TokenIcon({ symbol, size = 28 }: { symbol: string; size?: number }) {
  const s = symbol.toLowerCase();
  const file = s === "weth" ? "eth" : s;
  if (KNOWN.has(s)) {
    // biome-ignore lint/performance/noImgElement: static token logo, no optimization needed
    return (
      <img
        src={`/tokens/${file}.png`}
        alt={symbol}
        width={size}
        height={size}
        className="shrink-0 rounded-full"
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
