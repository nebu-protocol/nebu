"use client";

import { LOCALES, type Locale } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n-client";

const LABEL: Record<Locale, string> = { en: "EN", id: "ID" };

/** Segmented EN|ID. Ganti bahasa → cookie + refresh (server components ikut). Default EN. */
export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div
      role="group"
      aria-label="Language"
      className="hidden items-center rounded-lg border border-line/60 p-0.5 text-xs font-medium sm:flex"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={locale === l}
          onClick={() => setLocale(l)}
          className={`rounded-md px-2 py-1 transition-colors ${
            locale === l ? "bg-shade text-ink" : "text-soft hover:text-ink"
          }`}
        >
          {LABEL[l]}
        </button>
      ))}
    </div>
  );
}
