import { encodeFunctionData, parseAbi } from 'viem'
import { ADDRESSES } from '../../config/index.ts'
import { client } from '../../core/chain.ts'
import { liquidityForAmounts, rangeFromWidth, sqrtRatioX96AtTick } from '../executor/liquidity-math.ts'
import { tokenIdFromLogs, wcFor } from '../executor/live.ts'
import type { DexAdapter } from './adapter.ts'
import { infinityPoolId } from './pancake-infinity.ts'
import { resolveParameters } from './pancake-infinity-encode.ts'
import type { Encoded, PoolRef } from './types.ts'

const NATIVE = '0x0000000000000000000000000000000000000000' as const

/**
 * Bungkus adapter Infinity supaya SEMUA operasi write (mint/burn/swap) lewat LpVault:
 * agent MENANDATANGANI tapi DANA ada di vault, output dipaksa balik ke vault (owner-only
 * withdraw). Read (slot0/positionValue/quote/discovery) diteruskan ke base. Hanya untuk
 * pancake-infinity (vault = kontrak Infinity). Lihat contracts/LpVault.sol.
 */

const Q96 = 2n ** 96n
const SLIPPAGE_BPS = BigInt(process.env.INFI_SLIPPAGE_BPS ?? 500)

const vaultAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; address hooks; address poolManager; uint24 fee; bytes32 parameters; }',
  'function swap(PoolKey key, bool zeroForOne, uint128 amountIn, uint128 minOut)',
  'function mint(PoolKey key, int24 tickLower, int24 tickUpper, uint256 liquidity, uint128 amount0Max, uint128 amount1Max)',
  'function burn(uint256 tokenId, PoolKey key)',
])
const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function ownerOf(uint256) view returns (address)',
])
const clPoolManagerAbi = parseAbi([
  'function getSlot0(bytes32 id) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
])

/** PoolRef DB → struct PoolKey Infinity (6 field) untuk argumen kontrak vault. */
export function toInfinityPoolKey(pool: PoolRef) {
  return {
    currency0: pool.currency0 as `0x${string}`,
    currency1: pool.currency1 as `0x${string}`,
    hooks: pool.hooks as `0x${string}`,
    poolManager: ADDRESSES.clPoolManager,
    fee: pool.fee,
    parameters: resolveParameters(pool),
  } as const
}

const balanceOf = (token: `0x${string}`, who: `0x${string}`) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [who] }) as Promise<bigint>

const rawSlot0 = (poolId: string) =>
  client.readContract({
    address: ADDRESSES.clPoolManager,
    abi: clPoolManagerAbi,
    functionName: 'getSlot0',
    args: [poolId as `0x${string}`],
  }) as Promise<readonly [bigint, number, number, number]>

/** Calldata swap native→token1 lewat vault (dipakai executor utk leg ENTER). */
export function encodeVaultSwapFromNative(
  vault: `0x${string}`,
  pool: PoolRef,
  amountInWei: bigint,
  minOutWei: bigint,
): Encoded {
  const data = encodeFunctionData({
    abi: vaultAbi,
    functionName: 'swap',
    args: [toInfinityPoolKey(pool), true, amountInWei, minOutWei],
  })
  return { to: vault, data, value: 0n } // vault megang dana; tak ada native dikirim
}

/**
 * Adapter vault-mode: write lewat vault, read delegasi ke base. `vault` = alamat LpVault
 * milik owner wallet ini.
 */
export function withVault(base: DexAdapter, vault: `0x${string}`): DexAdapter {
  if (base.kind !== 'pancake-infinity') {
    throw new Error(`withVault hanya untuk pancake-infinity, bukan ${base.kind}`)
  }
  return {
    ...base,

    async mint(opts) {
      const token1 = opts.pool.currency1 as `0x${string}`
      const amount1 = await balanceOf(token1, vault) // saldo token1 ADA DI VAULT
      if (amount1 <= 0n) throw new Error('vault token1 balance 0 — swap belum settle?')
      const [sqrtPriceX96, tick] = await rawSlot0(opts.poolId)
      const { tickLower, tickUpper } = rangeFromWidth(tick, opts.pool.tick_spacing, opts.widthFactor)
      const raw = liquidityForAmounts(
        sqrtPriceX96,
        sqrtRatioX96AtTick(tickLower),
        sqrtRatioX96AtTick(tickUpper),
        opts.amount0Wei,
        amount1,
      )
      if (raw <= 0n) throw new Error('liquidity 0 (amount/range)')
      const poolKey = toInfinityPoolKey(opts.pool)
      const mk = (L: bigint) =>
        encodeFunctionData({
          abi: vaultAbi,
          functionName: 'mint',
          args: [poolKey, tickLower, tickUpper, L, opts.amount0Wei, amount1],
        })
      let data: `0x${string}` | null = null
      let last: unknown
      for (const hc of [99n, 98n, 96n, 92n, 85n]) {
        const L = (raw * hc) / 100n
        if (L <= 0n) continue
        const d = mk(L)
        try {
          await client.call({ account: opts.account.address, to: vault, data: d })
          data = d
          break
        } catch (e) {
          last = e
        }
      }
      if (!data) throw last ?? new Error('mint preflight gagal (vault) di semua haircut')
      const hash = await wcFor(opts.account).sendTransaction({ to: vault, data })
      const receipt = await client.waitForTransactionReceipt({ hash })
      return {
        hash,
        tokenId: tokenIdFromLogs(receipt.logs, ADDRESSES.clPositionManager), // NFT di-mint ke vault
        tickLower,
        tickUpper,
        liquidity: raw,
        amount1,
        status: receipt.status,
      }
    },

    async burn(opts) {
      // vault.burn hanya baca currency0/currency1 (TAKE_PAIR) — field PoolKey lain tak dipakai.
      const key = {
        currency0: opts.currency0,
        currency1: opts.currency1,
        hooks: NATIVE,
        poolManager: ADDRESSES.clPoolManager,
        fee: 0,
        parameters: `0x${'0'.repeat(64)}` as `0x${string}`,
      } as const
      const data = encodeFunctionData({ abi: vaultAbi, functionName: 'burn', args: [opts.tokenId, key] })
      await client.call({ account: opts.account.address, to: vault, data })
      const hash = await wcFor(opts.account).sendTransaction({ to: vault, data })
      const receipt = await client.waitForTransactionReceipt({ hash })
      return { hash, status: receipt.status }
    },

    async swapToNative(opts) {
      if (opts.pool.currency0 !== NATIVE) return null
      const token1 = opts.pool.currency1 as `0x${string}`
      const amountIn = await balanceOf(token1, vault) // token1 ada di vault
      if (amountIn <= 0n) return null
      let sqrtP = 0n
      try {
        ;[sqrtP] = await rawSlot0(infinityPoolId(opts.pool))
      } catch {
        return null
      }
      const grossOut = sqrtP > 0n ? (amountIn * Q96 * Q96) / (sqrtP * sqrtP) : 0n
      const minOut = (grossOut * (10_000n - SLIPPAGE_BPS)) / 10_000n
      const data = encodeFunctionData({
        abi: vaultAbi,
        functionName: 'swap',
        args: [toInfinityPoolKey(opts.pool), false, amountIn, minOut],
      })
      await client.call({ account: opts.account.address, to: vault, data })
      const hash = await wcFor(opts.account).sendTransaction({ to: vault, data })
      const receipt = await client.waitForTransactionReceipt({ hash })
      return { hash, status: receipt.status, ethOut: grossOut, amountIn }
    },

    encodeSwapFromNative(pool, amountInWei, minOutWei) {
      return encodeVaultSwapFromNative(vault, pool, amountInWei, minOutWei)
    },

    // getSlot0, positionValue, quoteFromNative, poolState, decodeInitialize, events,
    // poolManagerAddress → delegasi ke base (via spread di atas).
  }
}
