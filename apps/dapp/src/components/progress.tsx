/** Thin funding-progress bar (0-100). */
export function Progress({ pct, className = "" }: Readonly<{ pct: number; className?: string }>) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-shade ${className}`}
    >
      <div className="h-full rounded-full bg-pos" style={{ width: `${clamped}%` }} />
    </div>
  );
}
