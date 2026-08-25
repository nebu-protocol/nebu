import type { Metadata } from "next";

import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Sowee handles data: no accounts, no trackers, wallet auth via Dynamic.",
};

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="container-page py-16">
        <div className="mx-auto w-full max-w-3xl">
          <h1 className="text-3xl font-medium tracking-tight">Privacy Policy</h1>
          <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-body">
            <p>
              Sowee does not require an account and does not collect personal information on its own
              servers. All marketplace data shown in this demo is mock data generated locally.
            </p>
            <p>
              Connecting a wallet is handled by Dynamic, a third-party wallet provider; their
              processing of wallet addresses and authentication data is governed by their own
              privacy policy. Your wallet address is never stored by Sowee.
            </p>
            <p>
              Invoice documents selected in the issuer form are hashed in your browser via Web
              Crypto and never leave your device. This site does not use advertising trackers.
              Standard server logs (IP address, request path, timestamp) may be retained briefly for
              operational purposes.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
