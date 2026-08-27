import { createPublicClient, fallback, http } from 'viem'
import { ACTIVE_CHAIN, RPC_URLS } from '../config/index.ts'

/**
 * Transport fallback berurutan: gagal/429 di satu endpoint -> coba berikutnya.
 * Retry per-endpoint ringan; siklus ulang ditangani caller (chunker adaptif).
 * Chain aktif dari profil (config CHAIN): BSC/PancakeSwap default, Robinhood fallback.
 */
export const client = createPublicClient({
  chain: ACTIVE_CHAIN,
  transport: fallback(
    RPC_URLS.map((url) => http(url, { retryCount: 3, retryDelay: 400 })),
    { rank: false },
  ),
})
