"use client";

import { useT } from "@/lib/i18n-client";

export default function ErrorPage({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  const t = useT();
  return (
    <main className="container-page flex min-h-svh flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-medium tracking-tight">{t("Something went wrong")}</h1>
      <p className="max-w-sm text-sm text-soft">
        {t("An unexpected error occurred. Try again, or come back in a moment.")}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-black"
      >
        {t("Try again")}
      </button>
    </main>
  );
}
