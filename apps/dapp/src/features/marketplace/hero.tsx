import { FileCheck2 } from "lucide-react";
import Link from "next/link";

export function Hero() {
  return (
    <section className="mt-4 overflow-hidden rounded-3xl bg-hero text-white">
      <div className="relative flex flex-col justify-between gap-8 bg-[radial-gradient(120%_180%_at_85%_-20%,#14663c_0%,transparent_55%)] p-8 md:flex-row md:items-center md:p-10">
        <div className="max-w-xl">
          <h1 className="text-2xl font-medium tracking-tight md:text-[32px] md:leading-tight">
            Compliant Invoice Financing on Hedera
          </h1>
          <p className="mt-2 text-sm text-[#8fd0aa] md:text-[15px]">
            Issuers tokenize unpaid invoices as compliant bonds. Investors fund them at a discount
            in USDC and trade them on a compliant secondary market — settlement is automatic at
            maturity.
          </p>
          <Link
            href="/issuer/new"
            className="mt-5 inline-block rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            Tokenize an Invoice
          </Link>
        </div>
        <div className="flex items-center gap-6 pr-2 md:pr-8">
          <FileCheck2
            strokeWidth={1.2}
            className="h-28 w-28 text-[#7ed4a0] md:h-36 md:w-36"
            aria-hidden
          />
          <div className="text-3xl font-medium tracking-tight whitespace-nowrap md:text-4xl">
            Paid at <span className="text-[#7ed4a0]">maturity</span>
          </div>
        </div>
      </div>
    </section>
  );
}
