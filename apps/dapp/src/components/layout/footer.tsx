import Image from "next/image";
import Link from "next/link";

import { GithubIcon, XIcon } from "@/components/icons";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-[#fafaf8]">
      <div className="container-page py-10">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2.5">
            <Image
              src="/favicons/black/android-chrome-192x192.png"
              alt="Sowee"
              width={22}
              height={22}
            />
            <span className="text-sm font-medium">Sowee © 2026</span>
          </div>
          <Link href="/terms" className="text-sm text-soft hover:text-ink">
            Terms of Service
          </Link>
          <Link href="/privacy" className="text-sm text-soft hover:text-ink">
            Privacy Policy
          </Link>
          <div className="ml-auto flex items-center gap-4 text-soft">
            <Link
              href="https://x.com/soweefinance"
              target="_blank"
              rel="noreferrer"
              aria-label="X (Twitter)"
              className="hover:text-ink"
            >
              <XIcon size={16} />
            </Link>
            <Link
              href="https://github.com/sowee-finance/sowee"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="hover:text-ink"
            >
              <GithubIcon size={18} />
            </Link>
          </div>
        </div>

        <div className="mt-8 columns-1 gap-10 text-[11px] leading-relaxed text-faint md:columns-2 [&>p]:mb-3">
          <p>
            Sowee is a hackathon demo of compliant invoice financing on Hedera. All invoices, bonds,
            prices, and audit events shown here are mock data — nothing on this page is an offer to
            sell, or a solicitation of an offer to buy, any security or other financial instrument,
            and nothing here constitutes investment, legal, tax, or financial advice.
          </p>
          <p>
            Invoice-backed bonds involve significant risk, including payor default and possible loss
            of the entire amount invested. Implied APY figures are derived from issuance discounts
            and assume repayment in full at maturity; they are not a guarantee of return. Where such
            instruments are genuinely offered, availability is limited to eligible jurisdictions and
            verified investors, and additional restrictions apply.
          </p>
        </div>
      </div>
    </footer>
  );
}
