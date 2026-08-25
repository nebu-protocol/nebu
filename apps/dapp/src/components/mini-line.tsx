/**
 * Mini chart garis — tanpa gradient/fill, hanya line halus. Untuk sel tabel.
 * viewBox di-stretch ke container; banyak titik → mulus.
 */
export function MiniLine({
  values,
  up,
  width = 120,
  height = 34,
}: {
  values: number[];
  up: boolean;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="text-xs text-soft">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length - 1;
  const pad = 2;
  const h = height - pad * 2;
  const d = values
    .map((v, i) => {
      const x = (i / n) * width;
      const y = pad + h - ((v - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={up ? "#16a34a" : "#dc2626"}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
