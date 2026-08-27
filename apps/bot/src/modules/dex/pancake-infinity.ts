import { encodeAbiParameters, keccak256, parseAbi } from 'viem'
import { ADDRESSES } from '../../config/index.ts'
import { client } from '../../core/chain.ts'
import { amountsForLiquidity, sqrtRatioX96AtTick } from '../executor/liquidity-math.ts'
import type { DexAdapter } from './adapter.ts'
import type { PoolRef } from './types.ts'

/**
 * Adapter PancakeSwap Infinity (CLAMM) di BSC — target utama hackathon BNB.
 * Arsitektur kembar Uniswap v4 (Vault + CLPoolManager + CLPositionManager NFT),
 * bedanya: baca state via CLPoolManager (bukan StateView), PoolKey punya
 * `bytes32 parameters` (tickSpacing) + field `poolManager`, dan settle ke Vault.
 *
 * Status: READ path (getSlot0/positionValue) SIAP & bisa divalidasi on-chain tanpa
 * dana. WRITE path (mint/burn/swap) = slice berikutnya (encoding modifyLiquidities
 * Infinity + Universal Router + settle Vault).
 */

const Q96 = 2n ** 96n

const clPoolManagerAbi = parseAbi([
  'function getSlot0(bytes32 id) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getPosition(bytes32 id, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)',
])

/**
 * poolId Infinity = keccak256 dari 6 field PoolKey (0xc0 byte) urut:
 * currency0, currency1, hooks, poolManager(=CLPoolManager), fee, parameters.
 * parameters (no-hook) = tickSpacing << 16. Dipakai saat menyusun referensi pool
 * untuk write; untuk read poolId sudah tersimpan dari discovery.
 */
export function infinityPoolId(pool: PoolRef): `0x${string}` {
  const parameters = (`0x${(BigInt(pool.tick_spacing) << 16n).toString(16).padStart(64, '0')}`) as `0x${string}`
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'bytes32' },
      ],
      [
        pool.currency0 as `0x${string}`,
        pool.currency1 as `0x${string}`,
        pool.hooks as `0x${string}`,
        ADDRESSES.clPoolManager,
        pool.fee,
        parameters,
      ],
    ),
  )
}

const notImplemented = (op: string) => {
  throw new Error(
    `PancakeInfinityAdapter.${op}: write path belum diimplementasi (encoding modifyLiquidities Infinity + Universal Router). Sedang dibangun.`,
  )
}

export const pancakeInfinityAdapter: DexAdapter = {
  kind: 'pancake-infinity',

  async getSlot0(poolId) {
    try {
      const s = (await client.readContract({
        address: ADDRESSES.clPoolManager,
        abi: clPoolManagerAbi,
        functionName: 'getSlot0',
        args: [poolId as `0x${string}`],
      })) as readonly [bigint, number, number, number]
      return { sqrtPriceX96: s[0], tick: s[1] }
    } catch {
      return null
    }
  },

  async positionValue(p) {
    try {
      const salt = (`0x${p.tokenId.toString(16).padStart(64, '0')}`) as `0x${string}`
      const [slot0, pos] = await Promise.all([
        client.readContract({
          address: ADDRESSES.clPoolManager,
          abi: clPoolManagerAbi,
          functionName: 'getSlot0',
          args: [p.poolId as `0x${string}`],
        }) as Promise<readonly [bigint, number, number, number]>,
        client.readContract({
          address: ADDRESSES.clPoolManager,
          abi: clPoolManagerAbi,
          functionName: 'getPosition',
          args: [p.poolId as `0x${string}`, ADDRESSES.clPositionManager, p.tickLower, p.tickUpper, salt],
        }) as Promise<readonly [bigint, bigint, bigint]>,
      ])
      const sqrtP = slot0[0]
      const liquidity = pos[0]
      if (liquidity <= 0n || sqrtP <= 0n) return null
      const { amount0, amount1 } = amountsForLiquidity(
        sqrtP,
        sqrtRatioX96AtTick(p.tickLower),
        sqrtRatioX96AtTick(p.tickUpper),
        liquidity,
      )
      // token1 → native: /price, price=(sqrtP/Q96)² → ×Q96²/sqrtP²
      const principalWei = amount0 + (amount1 * Q96 * Q96) / (sqrtP * sqrtP)
      // ponytail: fee accrual butuh feeGrowthInside (global − below − above) — belum
      // dihitung; principal dominan di PnL (riset). feesEth=0 sementara, upgrade nanti.
      return {
        liquidity,
        principalEth: Number(principalWei) / 1e18,
        feesEth: 0,
        valueEth: Number(principalWei) / 1e18,
      }
    } catch {
      return null
    }
  },

  mint: () => notImplemented('mint'),
  burn: () => notImplemented('burn'),
  swapToNative: () => notImplemented('swapToNative'),
}
