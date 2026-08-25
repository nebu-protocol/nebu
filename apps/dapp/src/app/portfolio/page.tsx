import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { turnstileSiteKey } from "@/server/turnstile";

import { PortfolioClient } from "./portfolio-client";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="mb-6 text-2xl font-semibold tracking-tight">Portfolio</h1>
        <PortfolioClient siteKey={turnstileSiteKey()} />
        <p className="mt-4 text-xs text-soft">
          PnL untuk wallet yang di-connect. Net vs HODL — simulasi, bukan nasihat finansial.
        </p>
      </main>
    </>
  );
}
