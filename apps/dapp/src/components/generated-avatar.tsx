/**
 * Avatar fallback deterministik dari nama (cluster lingkaran, warna dari hash nama).
 * Nama sama → avatar sama. Pure inline SVG, tanpa dependency.
 */

function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function GeneratedAvatar({
  name,
  size = 40,
  className,
}: {
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const seed = hash((name || "?").toLowerCase());
  const hue = seed % 360;

  const circles = Array.from({ length: 5 }, (_, i) => {
    const s = seed >> (i * 4);
    const angle = ((s % 360) * Math.PI) / 180;
    const dist = 10 + (s % 12);
    return {
      cx: 50 + Math.cos(angle) * dist,
      cy: 50 + Math.sin(angle) * dist,
      r: 20 + ((s >> 5) % 10),
      light: 28 + ((s >> 3) % 42),
    };
  });

  return (
    <svg
      aria-label={name || "avatar"}
      className={`shrink-0 rounded-full ${className ?? ""}`}
      height={size}
      role="img"
      viewBox="0 0 100 100"
      width={size}
    >
      <rect fill={`hsl(${hue} 60% 90%)`} height="100" width="100" />
      {circles.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} fill={`hsl(${hue} 55% ${c.light}%)`} opacity={0.85} r={c.r} />
      ))}
    </svg>
  );
}
