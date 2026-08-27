import { ADDRESSES } from '../../config/index.ts'
import { initializeEvent, stateViewAbi, swapEvent } from '../../contracts/abi.ts'
import { client } from '../../core/chain.ts'
import { burnLive, mintLive, positionValueLive, swapToEthLive } from '../executor/live.ts'
import type { DexAdapter } from './adapter.ts'

/**
 * Adapter Uniswap v4 (Robinhood Chain, fallback). Membungkus jalur `live.ts` yang
 * sudah terbukti on-chain (mint/burn/swap round-trip) — TIDAK ditulis ulang; cukup
 * dipetakan ke antarmuka DexAdapter. Baca state via StateView.
 */
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

  // --- scanner ---
  poolManagerAddress: ADDRESSES.poolManager,
  initializeEvent,
  swapEvent,

  decodeInitialize(a) {
    if (!a.id || !a.currency0 || !a.currency1) return null
    return {
      poolId: a.id as string,
      currency0: (a.currency0 as string).toLowerCase(),
      currency1: (a.currency1 as string).toLowerCase(),
      fee: Number(a.fee),
      tickSpacing: Number(a.tickSpacing),
      hooks: (a.hooks as string).toLowerCase(),
    }
  },

  async poolState(poolId) {
    try {
      const sv = { address: ADDRESSES.stateView, abi: stateViewAbi } as const
      const id = poolId as `0x${string}`
      const [slot0, liquidity, feeGrowth] = await Promise.all([
        client.readContract({ ...sv, functionName: 'getSlot0', args: [id] }) as Promise<
          readonly [bigint, number, number, number]
        >,
        client.readContract({ ...sv, functionName: 'getLiquidity', args: [id] }) as Promise<bigint>,
        client.readContract({ ...sv, functionName: 'getFeeGrowthGlobals', args: [id] }) as Promise<
          readonly [bigint, bigint]
        >,
      ])
      return {
        sqrtPriceX96: slot0[0],
        tick: slot0[1],
        lpFee: slot0[3],
        liquidity,
        feeGrowthGlobal0: feeGrowth[0],
        feeGrowthGlobal1: feeGrowth[1],
      }
    } catch {
      return null
    }
  },
}
