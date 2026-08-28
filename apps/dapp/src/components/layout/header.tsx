import Image from "next/image";
import Link from "next/link";

import { BnbIcon } from "@/components/icons";
import { LanguageToggle } from "./language-toggle";
import { MobileNav, NavLinks } from "./nav-links";
import { WalletButton } from "./wallet-button";

export function Header() {
  return (
    <header className="border-line/60 sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Image src="/lp-logo.png" alt="LP Bot" width={24} height={24} className="size-6 rounded-md" />
            LP Bot
          </Link>
          <NavLinks />
        </div>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <span
            title="BNB Smart Chain"
            className="hidden h-8 w-8 items-center justify-center rounded-lg border border-line/60 sm:flex"
          >
            <BnbIcon size={18} />
          </span>
          <WalletButton />
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
