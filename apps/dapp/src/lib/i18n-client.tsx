"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { LOCALE_COOKIE, translate, type Locale } from "./i18n";

type LocaleCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (s: string) => string;
};

const Ctx = createContext<LocaleCtx | null>(null);

/**
 * Provider locale (dibungkus di root). `initial` dibaca server dari cookie supaya render
 * pertama konsisten (tanpa flicker). Ganti bahasa: set cookie + router.refresh() supaya
 * server components ikut re-render dengan locale baru, plus state lokal utk client instan.
 */
export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale;
  children: React.ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initial);
  const router = useRouter();

  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      setLocaleState(l);
      router.refresh();
    },
    [router],
  );

  const value = useMemo<LocaleCtx>(
    () => ({ locale, setLocale, t: (s: string) => translate(locale, s) }),
    [locale, setLocale],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useLocaleCtx(): LocaleCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLocale harus di dalam <LocaleProvider>");
  return ctx;
}

export const useLocale = () => useLocaleCtx();
/** Hook `t` untuk client components: `const t = useT(); t("Overview")`. */
export const useT = () => useLocaleCtx().t;
