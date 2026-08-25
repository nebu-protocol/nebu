import type { Metadata } from "next";
import { Suspense } from "react";

import { MarketplacePage } from "@/features/marketplace/marketplace-page";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

// Suspense boundary: MarketplacePage reads ?q= via useSearchParams.
export default function Page() {
  return (
    <Suspense>
      <MarketplacePage />
    </Suspense>
  );
}
