/**
 * Profil chain AKTIF untuk dapp — dinamis, bukan hardcode. Dipilih via env NEXT_PUBLIC_CHAIN
 * (default 'bsc' = target hackathon BNB). Menentukan nama chain di indikator UI + simbol native
 * (BNB di BSC, ETH di Robinhood) supaya label & data selalu konsisten dengan chain yang dijalankan
 * bot. NEXT_PUBLIC_ = ikut ke client bundle → server & client components sama-sama baca.
 */
export type ChainKind = "bsc" | "robinhood";

export type ChainInfo = {
  id: number;
  name: string;
  /** simbol mata uang native (unit saldo/deposit/PnL di UI). */
  native: string;
  kind: ChainKind;
  /** RPC HTTP untuk read on-chain (health check, saldo). Chain-aware, bukan hardcode Robinhood. */
  rpc: string;
};

const CHAINS: Record<ChainKind, ChainInfo> = {
  bsc: {
    id: 56,
    name: "BNB Smart Chain",
    native: "BNB",
    kind: "bsc",
    rpc: process.env.NEXT_PUBLIC_BSC_RPC_URL ?? "https://bsc-dataseed.bnbchain.org",
  },
  robinhood: {
    id: 4663,
    name: "Robinhood Chain",
    native: "ETH",
    kind: "robinhood",
    rpc: process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
  },
};

const KEY = (process.env.NEXT_PUBLIC_CHAIN ?? "bsc") as ChainKind;
export const ACTIVE_CHAIN: ChainInfo = CHAINS[KEY] ?? CHAINS.bsc;
/** Simbol native chain aktif — ganti literal "ETH" di label UI dengan ini. */
export const NATIVE = ACTIVE_CHAIN.native;
/** RPC HTTP chain aktif (read on-chain di server: checkRpc, getBalanceEth). */
export const RPC_URL = ACTIVE_CHAIN.rpc;
