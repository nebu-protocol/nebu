"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import type { Account, Chain, Transport, WalletClient } from "viem";

import { SESSION_MARKER } from "./session-marker";

// Tiny external store so wallet consumers never remount when the heavy
// Dynamic SDK boots later: the SDK just writes new state into the store.

export type ConnectedWalletClient = WalletClient<Transport, Chain, Account>;

export type WalletState = {
  address?: string;
  /** True while a previous session may still be restoring (SDK booting). */
  booting: boolean;
  connect: () => void;
  disconnect: () => void;
  /** Viem wallet client on Hedera testnet (chain 296); set once an EVM wallet is connected. */
  getWalletClient?: () => Promise<ConnectedWalletClient>;
};

const noop = () => undefined;

// Marker maintained by the SDK bridge so a reload can tell "restoring a
// session" apart from "never connected" before the SDK even loads —
// without it every consumer flashes the disconnected UI for returning
// users, and never-connected users would see pointless skeletons. Kept in
// localStorage (client truth pre-hydration) AND a cookie (SSR truth).
export const hadSession = () => {
  try {
    return globalThis.localStorage?.getItem(SESSION_MARKER) === "1";
  } catch {
    return false;
  }
};

export const rememberSession = (connected: boolean) => {
  try {
    if (connected) {
      localStorage.setItem(SESSION_MARKER, "1");
      // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is still missing in Safari/Firefox
      document.cookie = `${SESSION_MARKER}=1; path=/; max-age=31536000; SameSite=Lax`;
    } else {
      localStorage.removeItem(SESSION_MARKER);
      // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is still missing in Safari/Firefox
      document.cookie = `${SESSION_MARKER}=; path=/; max-age=0; SameSite=Lax`;
    }
  } catch {
    // Storage unavailable (private mode): boot state just defaults off.
  }
};

// Connect clicked before the SDK finished loading: remember the intent and
// open the auth flow as soon as the SDK mounts.
let pendingConnect = false;
const markPendingConnect = () => {
  pendingConnect = true;
};
export const consumePendingConnect = () => {
  const was = pendingConnect;
  pendingConnect = false;
  return was;
};

// Two stable server snapshots: which one a request gets is decided by the
// session cookie (read in the server layout, delivered via BootHint), so
// returning users get skeleton HTML from the very first byte.
const initial: WalletState = {
  booting: false,
  connect: markPendingConnect,
  disconnect: noop,
};
const initialBooting: WalletState = { ...initial, booting: true };
let state: WalletState = { ...initial, booting: hadSession() };
const listeners = new Set<() => void>();

export const walletStore = {
  get: () => state,
  set: (next: WalletState) => {
    state = next;
    for (const listener of listeners) listener();
  },
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Whether this request's SSR pass should render the booting state
    (session cookie present). Provided by WalletProvider. */
export const BootHintContext = createContext(false);

export function useWallet(): WalletState {
  const ssrBooting = useContext(BootHintContext);
  return useSyncExternalStore(walletStore.subscribe, walletStore.get, () =>
    ssrBooting ? initialBooting : initial,
  );
}
