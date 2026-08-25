"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { BootHintContext } from "./wallet-store";

export { useWallet } from "./wallet-store";

const DynamicBoot = dynamic(() => import("./dynamic-boot"), { ssr: false });

/**
 * Renders children immediately; the Dynamic SDK (≈1MB of JS) boots in a
 * parallel branch once the browser is idle, so LCP/TBT never pay for it.
 * Consumers read wallet state via useWallet() and see the SDK "appear".
 * initialBooting = "this request carried the session cookie": SSR then
 * renders restore-skeletons instead of flashing the disconnected UI.
 */
export function WalletProvider({
  children,
  initialBooting = false,
}: Readonly<{ children: React.ReactNode; initialBooting?: boolean }>) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => setReady(true), {
        timeout: 3000,
      });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(() => setReady(true), 2000);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <BootHintContext.Provider value={initialBooting}>
      {children}
      {ready && <DynamicBoot />}
    </BootHintContext.Provider>
  );
}
