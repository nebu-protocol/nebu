"use client";

import { useEffect, useRef, useState } from "react";

import { LOCALES, type Locale } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n-client";

// Nama bahasa (natif) — ditampilkan di dropdown globe.
const LABEL: Record<Locale, string> = { en: "English", id: "Bahasa Indonesia" };

function GlobeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
    </svg>
  );
}

/** Pemilih bahasa: ikon globe → dropdown daftar bahasa. Ganti → cookie + refresh. Default EN. */
export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Language"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border border-line/60 text-soft hover:bg-shade hover:text-ink ${open ? "bg-shade text-ink" : ""}`}
      >
        <GlobeIcon />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-2xl border border-line/60 bg-white p-1.5 shadow-xl">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={locale === l}
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm ${
                locale === l ? "bg-shade font-medium text-ink" : "text-soft hover:bg-shade hover:text-ink"
              }`}
            >
              {LABEL[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
