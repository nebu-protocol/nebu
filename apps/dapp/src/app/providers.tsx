"use client";

import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// NEXT_PUBLIC = ikut ke client bundle; env id Dynamic memang publik (keamanan lewat
// Allowed Origins/CORS di dashboard, bukan kerahasiaan id). Fallback biar build VPS aman.
const DYNAMIC_ENV_ID =
  process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "9916a155-db3a-4ff4-8e0a-35888b1bfe7a";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );

  // Daftarkan phantom-ui web component setelah hydration (design system template).
  useEffect(() => {
    import("@aejkatappaja/phantom-ui").catch(() => {});
  }, []);

  return (
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENV_ID,
        walletConnectors: [EthereumWalletConnectors],
        // Robinhood Chain (4663) — biar wallet konek ke jaringan yg benar.
        overrides: {
          evmNetworks: [
            {
              blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
              chainId: 4663,
              chainName: "Robinhood Chain",
              iconUrls: ["https://lp.ifajar.dev/robinhood-chain.png"],
              name: "Robinhood Chain",
              nativeCurrency: { decimals: 18, name: "Ether", symbol: "ETH" },
              networkId: 4663,
              rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
            },
          ],
        },
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </DynamicContextProvider>
  );
}
