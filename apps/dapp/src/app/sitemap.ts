import type { MetadataRoute } from "next";

import { DEMO_DATA } from "@/lib/live/chain";
import { BONDS, filterBonds } from "@/lib/mock";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  // Live invoice ids are ephemeral testnet listings — only fixture pages are indexed.
  const bonds = DEMO_DATA ? filterBonds(BONDS, {}) : [];
  return [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/terms`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "monthly", priority: 0.3 },
    ...bonds.map((bond) => ({
      url: `${SITE_URL}/invoices/${bond.id}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
