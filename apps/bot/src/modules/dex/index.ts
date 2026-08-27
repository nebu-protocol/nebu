import { DEX_KIND } from '../../config/index.ts'
import type { DexAdapter } from './adapter.ts'
import { uniswapV4Adapter } from './uniswap-v4.ts'

export type { DexAdapter } from './adapter.ts'
export type * from './types.ts'

let cached: DexAdapter | null = null

/**
 * Adapter DEX untuk chain aktif (config CHAIN → DEX_KIND). LAZY (dipanggil di dalam
 * fungsi, bukan saat import) supaya modul bisa diimpor di chain mana pun tanpa error.
 */
export function getDexAdapter(): DexAdapter {
  if (cached) return cached
  switch (DEX_KIND) {
    case 'uniswap-v4':
      cached = uniswapV4Adapter
      return cached
    case 'pancake-infinity':
      throw new Error(
        'PancakeInfinityAdapter belum diimplementasi (sedang dibangun). ' +
          'Sementara set CHAIN=robinhood untuk jalur Uniswap v4.',
      )
  }
}
