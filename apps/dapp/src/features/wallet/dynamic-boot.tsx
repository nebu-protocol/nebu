"use client";

import { EthereumWalletConnectors, isEthereumWallet } from "@dynamic-labs/ethereum";
import { DynamicContextProvider, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useEffect } from "react";

import { CHAIN_ID, EXPLORER_URL, RPC_URL } from "@/lib/live/chain";
import { consumePendingConnect, hadSession, rememberSession, walletStore } from "./wallet-store";

// `||` (not ??): an empty env var must fall back to the sandbox too.
const DYNAMIC_ENVIRONMENT_ID =
  process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ||
  // Dynamic's public sandbox environment; replace with your own for production.
  "2762a57b-faa4-41ce-9f16-abff9300e2c9";

/** Hedera testnet as a Dynamic custom EVM network (chain 296, Hashio RPC). */
const HEDERA_TESTNET_NETWORK = {
  blockExplorerUrls: [EXPLORER_URL],
  chainId: CHAIN_ID,
  chainName: "Hedera Testnet",
  iconUrls: ["https://app.dynamic.xyz/assets/networks/hedera.svg"],
  isTestnet: true,
  name: "Hedera Testnet",
  nativeCurrency: { decimals: 18, name: "HBAR", symbol: "HBAR" },
  networkId: CHAIN_ID,
  rpcUrls: [RPC_URL],
  vanityName: "Hedera Testnet",
};

/** Mirrors the SDK's wallet state into the app-level wallet store. */
function Bridge() {
  const { setShowAuthFlow, primaryWallet, handleLogOut, sdkHasLoaded } = useDynamicContext();

  useEffect(() => {
    if (sdkHasLoaded) rememberSession(Boolean(primaryWallet?.address));
    walletStore.set({
      address: primaryWallet?.address,
      // Only a returning session counts as booting — a first-time visitor
      // must keep seeing the connect UI while the SDK loads.
      booting: !sdkHasLoaded && hadSession(),
      connect: () => setShowAuthFlow(true),
      disconnect: () => void handleLogOut(),
      getWalletClient:
        primaryWallet && isEthereumWallet(primaryWallet)
          ? async () => {
              // Nudge the wallet onto Hedera testnet first; some connectors
              // cannot switch programmatically — the caller re-checks chain id.
              await primaryWallet.switchNetwork(CHAIN_ID).catch(() => undefined);
              return await primaryWallet.getWalletClient(String(CHAIN_ID));
            }
          : undefined,
    });
  }, [primaryWallet, sdkHasLoaded, setShowAuthFlow, handleLogOut]);

  useEffect(() => {
    if (consumePendingConnect()) setShowAuthFlow(true);
  }, [setShowAuthFlow]);

  return null;
}

/**
 * The only module that imports the (heavy) Dynamic SDK — loaded lazily
 * after idle so it never sits on the boot critical path.
 */
export default function DynamicBoot() {
  return (
    <DynamicContextProvider
      settings={{
        environmentId: DYNAMIC_ENVIRONMENT_ID,
        walletConnectors: [EthereumWalletConnectors],
        overrides: { evmNetworks: [HEDERA_TESTNET_NETWORK] },
        // Wallet-connect only: skips Dynamic's email/embedded-wallet sign-up
        // flow — the demo needs MetaMask on chain 296, not user accounts.
        initialAuthenticationMode: "connect-only",
      }}
    >
      <Bridge />
    </DynamicContextProvider>
  );
}
