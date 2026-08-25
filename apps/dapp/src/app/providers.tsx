"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { WalletProvider } from "@/features/wallet/wallet-provider";

export function Providers({
  children,
  initialBooting,
}: Readonly<{ children: React.ReactNode; initialBooting: boolean }>) {
  // Data is mocked for now, but the query client stays: the Hedera mirror
  // node wiring will hydrate through it exactly like the template did.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
      }),
  );

  // Register the phantom-ui custom element AFTER hydration: if it upgrades
  // mid-hydration it self-adds attributes (mode/animation/inert) the server
  // HTML never had, tripping React's mismatch warning. The
  // `phantom-ui:not(:defined)` CSS guard styles the pre-upgrade window.
  useEffect(() => {
    import("@aejkatappaja/phantom-ui");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider initialBooting={initialBooting}>{children}</WalletProvider>
    </QueryClientProvider>
  );
}
