import Link from "next/link";

import { getT } from "@/lib/i18n-server";

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="container-page flex min-h-svh flex-col items-center justify-center gap-4 text-center">
      <p className="font-mono text-sm text-soft">404</p>
      <h1 className="text-2xl font-medium tracking-tight">{t("Page not found")}</h1>
      <p className="max-w-sm text-sm text-soft">
        {t("The page you are looking for does not exist or has moved.")}
      </p>
      <Link
        href="/"
        className="mt-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black"
      >
        {t("Back to Overview")}
      </Link>
    </main>
  );
}
