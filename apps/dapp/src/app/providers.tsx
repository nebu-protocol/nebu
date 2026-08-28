"use client";

import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { LocaleProvider } from "../lib/i18n-client";
import { DEFAULT_LOCALE, type Locale } from "../lib/i18n";

// NEXT_PUBLIC = ikut ke client bundle; env id Dynamic memang publik (keamanan lewat
// Allowed Origins/CORS di dashboard, bukan kerahasiaan id). Fallback biar build VPS aman.
const DYNAMIC_ENV_ID =
  process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "9916a155-db3a-4ff4-8e0a-35888b1bfe7a";

export function Providers({
  children,
  initialLocale = DEFAULT_LOCALE,
}: Readonly<{ children: React.ReactNode; initialLocale?: Locale }>) {
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
        // Nebu = BNB-native. Hanya BNB Smart Chain (56) yang didukung, jadi connect/sign
        // selalu di BSC — bukan Robinhood/chain lain.
        overrides: {
          evmNetworks: [
            {
              blockExplorerUrls: ["https://bscscan.com"],
              chainId: 56,
              chainName: "BNB Smart Chain",
              iconUrls: ["https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png"],
              name: "BNB Smart Chain",
              nativeCurrency: { decimals: 18, name: "BNB", symbol: "BNB" },
              networkId: 56,
              rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
            },
          ],
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <LocaleProvider initial={initialLocale}>{children}</LocaleProvider>
      </QueryClientProvider>
    </DynamicContextProvider>
  );
}
