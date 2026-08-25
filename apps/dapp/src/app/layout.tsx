import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";

import "./globals.css";
import "@aejkatappaja/phantom-ui/ssr.css";

import { SESSION_MARKER } from "@/features/wallet/session-marker";

import { Providers } from "./providers";

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Sowee | Compliant Invoice Financing on Hedera",
    template: "%s | Sowee",
  },
  description:
    "Sowee turns unpaid invoices into compliant bonds on Hedera: issuers tokenize invoices, " +
    "investors fund them at a discount in USDC, and settlement happens automatically at maturity.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      {
        url: "/favicons/black/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicons/black/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/favicons/white/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/favicons/white/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
        media: "(prefers-color-scheme: dark)",
      },
    ],
    apple: "/favicons/black/apple-touch-icon.png",
  },
  openGraph: {
    title: "Sowee — Compliant Invoice Financing on Hedera",
    description:
      "Issuers tokenize unpaid invoices as compliant bonds; investors fund them at a discount " +
      "in USDC and trade them on a compliant secondary market.",
    siteName: "Sowee",
    type: "website",
    // images come from the opengraph-image.tsx file convention
  },
  twitter: { card: "summary_large_image" },
};

// The wallet SDK reads browser state during render, which breaks build-time
// prerendering; every route renders on request instead.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Session cookie present = a wallet session is probably restoring: SSR
  // renders the restore-skeletons instead of flashing the disconnected UI.
  const cookieStore = await cookies();
  const initialBooting = cookieStore.get(SESSION_MARKER)?.value === "1";

  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable} font-sans antialiased`}>
      <body>
        <Providers initialBooting={initialBooting}>{children}</Providers>
      </body>
    </html>
  );
}
