import type { Metadata } from "next";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of service for the Sowee invoice financing demo.",
};

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="container-page py-16">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-3xl font-medium tracking-tight">Terms of Service</h1>
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-body">
            <p>
              Sowee is a demonstration interface for compliant invoice financing on Hedera. By using
              this site you acknowledge that it is provided as-is, without warranties of any kind,
              and that it does not execute real transactions, custody assets, or provide brokerage
              services. All invoices, bonds, and audit events shown are mock data.
            </p>
            <p>
              Nothing on this site constitutes investment, legal, tax, or financial advice, or an
              offer to buy or sell any security or other financial instrument. Implied yields are
              illustrative calculations, not promises of return.
            </p>
            <p>
              You are responsible for complying with the laws of your jurisdiction when interacting
              with digital assets.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
