import Image from "next/image";
import Link from "next/link";

import { getT } from "@/lib/i18n-server";

export async function Footer() {
  const t = await getT();
  return (
    <footer className="mt-20 border-t border-line bg-[#fafaf8]">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2.5">
            <Image src="/lp-logo.png" alt="LP Bot" width={22} height={22} className="rounded" />
            <span className="text-sm font-medium">LP Bot © 2026</span>
          </div>
          <Link href="/terms" className="text-sm text-soft hover:text-ink">
            {t("Terms")}
          </Link>
          <Link href="/privacy" className="text-sm text-soft hover:text-ink">
            {t("Privacy")}
          </Link>
        </div>

        <div className="mt-8 text-[11px] leading-relaxed text-faint">
          <p className="mb-3 max-w-3xl">
            {t(
              "LP Bot menyediakan automated liquidity provision di Uniswap v4 (Robinhood Chain). Semua angka APR/PnL bersifat gross (pre-IL), berbasis simulasi, dan bukan jaminan hasil. Menyediakan likuiditas pada pool volatil (mis. memecoin) berisiko tinggi termasuk impermanent loss dan kehilangan sebagian/seluruh modal. Tidak ada di halaman ini yang merupakan nasihat investasi, hukum, pajak, atau finansial.",
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
