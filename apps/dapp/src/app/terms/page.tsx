import type { Metadata } from "next";

import { Header } from "@/components/layout/header";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Terms</h1>
        <p className="mt-4 text-soft">
          LP Bot disediakan apa adanya, tanpa jaminan. Menyediakan likuiditas berisiko (impermanent
          loss, rug, kehilangan modal). Angka APR/PnL bersifat gross dan simulasi—bukan jaminan
          hasil dan bukan nasihat finansial. Dengan menggunakan layanan ini kamu menerima seluruh
          risiko atas dana yang kamu kelola.
        </p>
      </main>
    </>
  );
}
