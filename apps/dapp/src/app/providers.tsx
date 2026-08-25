"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }),
  );

  // Daftarkan phantom-ui web component setelah hydration (design system template).
  useEffect(() => {
    import("@aejkatappaja/phantom-ui").catch(() => {});
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
