import type { Metadata } from "next";

import { Header } from "@/components/layout/header";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-semibold">Privacy</h1>
        <p className="mt-4 text-soft">
          LP Bot tidak mengumpulkan data pribadi. Yang kami simpan hanya data on-chain publik (pool,
          posisi) dan—bila kamu mengaktifkan automation—private key wallet yang kamu berikan,
          disimpan terenkripsi (AES-256-GCM) di server dan hanya dipakai untuk menjalankan strategi
          LP. Connect wallet hanya membaca alamat publik.
        </p>
      </main>
    </>
  );
}
