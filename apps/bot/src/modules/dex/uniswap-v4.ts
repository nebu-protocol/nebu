import { parseAbi } from 'viem'
import { ADDRESSES } from '../../config/index.ts'
import { client } from '../../core/chain.ts'
import { burnLive, mintLive, positionValueLive, swapToEthLive } from '../executor/live.ts'
import type { DexAdapter } from './adapter.ts'

/**
 * Adapter Uniswap v4 (Robinhood Chain, fallback). Membungkus jalur `live.ts` yang
 * sudah terbukti on-chain (mint/burn/swap round-trip) — TIDAK ditulis ulang; cukup
 * dipetakan ke antarmuka DexAdapter. Baca slot0 langsung via StateView.
 */
const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
])

export const uniswapV4Adapter: DexAdapter = {
  kind: 'uniswap-v4',

  async getSlot0(poolId) {
    try {
      const s = (await client.readContract({
        address: ADDRESSES.stateView,
        abi: stateViewAbi,
        functionName: 'getSlot0',
        args: [poolId as `0x${string}`],
      })) as readonly [bigint, number, number, number]
      return { sqrtPriceX96: s[0], tick: s[1] }
    } catch {
      return null
    }
  },

  positionValue: (p) => positionValueLive(p),
  mint: (p) => mintLive(p),
  burn: (p) => burnLive(p),
  swapToNative: (p) => swapToEthLive(p),
}
