"use client";

/** Toggle switch bergaya (checkbox tersembunyi) — bisa dipakai di form (name). */
export function Toggle({
  name,
  defaultChecked,
  label,
}: {
  name: string;
  defaultChecked?: boolean;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <span className="relative inline-block h-5 w-9">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="absolute inset-0 rounded-full bg-line/70 transition-colors peer-checked:bg-emerald-500" />
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-4" />
      </span>
      {label}
    </label>
  );
}
