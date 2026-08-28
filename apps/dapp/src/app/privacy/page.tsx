import type { Metadata } from "next";

import { Header } from "@/components/layout/header";
import { getT } from "@/lib/i18n-server";

export const metadata: Metadata = { title: "Privacy" };

export default async function PrivacyPage() {
  const t = await getT();
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-semibold">{t("Privacy")}</h1>
        <p className="mt-4 text-soft">
          {t(
            "LP Bot tidak mengumpulkan data pribadi. Yang kami simpan hanya data on-chain publik (pool, posisi) dan—bila kamu mengaktifkan automation—private key wallet yang kamu berikan, disimpan terenkripsi (AES-256-GCM) di server dan hanya dipakai untuk menjalankan strategi LP. Connect wallet hanya membaca alamat publik.",
          )}
        </p>
      </main>
    </>
  );
}
