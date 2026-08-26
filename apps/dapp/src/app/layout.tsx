import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";
import "@aejkatappaja/phantom-ui/ssr.css";

import { Providers } from "./providers";

const fontSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://lp.ifajar.dev";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "LP Bot | Automated Liquidity on Robinhood Chain",
    template: "%s | LP Bot",
  },
  description:
    "Automated Uniswap v4 liquidity provision on Robinhood Chain: survivor-pool selection, " +
    "concentrated ranges, and PnL benchmarked against HODL.",
  openGraph: {
    title: "LP Bot | Automated Liquidity on Robinhood Chain",
    description: "Automated Uniswap v4 liquidity provision, benchmarked against HODL.",
    siteName: "LP Bot",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
