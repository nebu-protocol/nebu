import { cookies } from "next/headers";

import { LOCALE_COOKIE, normalizeLocale, translate, type Locale } from "./i18n";

/** Locale aktif dari cookie (server components / route handlers). Default 'en'. */
export async function getLocale(): Promise<Locale> {
  return normalizeLocale((await cookies()).get(LOCALE_COOKIE)?.value);
}

/** Helper `t` untuk server components: `const t = await getT(); t("Overview")`. */
export async function getT(): Promise<(s: string) => string> {
  const locale = await getLocale();
  return (s: string) => translate(locale, s);
}
