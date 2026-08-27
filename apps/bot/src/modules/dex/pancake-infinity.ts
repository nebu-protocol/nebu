import { encodeAbiParameters, keccak256, parseAbi, parseAbiItem } from 'viem'
import { ADDRESSES, NATIVE } from '../../config/index.ts'
import { client } from '../../core/chain.ts'
import {
  amountsForLiquidity,
  liquidityForAmounts,
  rangeFromWidth,
  sqrtRatioX96AtTick,
} from '../executor/liquidity-math.ts'
import { ensureApprovals, tokenIdFromLogs, wcFor } from '../executor/live.ts'
import type { DexAdapter } from './adapter.ts'
import type { PoolRef } from './types.ts'
import {
  encodeInfinityBurn,
  encodeInfinityMint,
  encodeInfinitySwapToNative,
  encodeParameters,
} from './pancake-infinity-encode.ts'

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
const SLIPPAGE_BPS = BigInt(process.env.INFI_SLIPPAGE_BPS ?? 500) // 5% — meme ilikuid, exit prioritas

const clPoolManagerAbi = parseAbi([
  'function getSlot0(bytes32 id) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 id) view returns (uint128 liquidity)',
  'function getFeeGrowthGlobals(bytes32 id) view returns (uint256 feeGrowthGlobal0, uint256 feeGrowthGlobal1)',
  'function getPosition(bytes32 id, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)',
])
const erc20Abi = parseAbi(['function balanceOf(address) view returns (uint256)'])

// Event Infinity CLPoolManager (beda dari v4: hooks+fee+parameters, +protocolFee di Swap).
const initializeEvent = parseAbiItem(
  'event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)',
)
const swapEvent = parseAbiItem(
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)',
)

/** tickSpacing dari bytes32 parameters (bit [16,40), 24-bit). Pool no-hook. */
function tickSpacingFromParameters(parameters: string): number {
  return Number((BigInt(parameters) >> 16n) & 0xffffffn)
}

/**
 * poolId Infinity = keccak256 dari 6 field PoolKey (0xc0 byte) urut:
 * currency0, currency1, hooks, poolManager(=CLPoolManager), fee, parameters.
 * parameters (no-hook) = tickSpacing << 16. Dipakai saat menyusun referensi pool
 * untuk write; untuk read poolId sudah tersimpan dari discovery.
 */
export function infinityPoolId(pool: PoolRef): `0x${string}` {
  const parameters = encodeParameters(pool.tick_spacing)
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

const balanceOf = (token: `0x${string}`, owner: `0x${string}`) =>
  client.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }) as Promise<bigint>

const rawSlot0 = (poolId: string) =>
  client.readContract({
    address: ADDRESSES.clPoolManager,
    abi: clPoolManagerAbi,
    functionName: 'getSlot0',
    args: [poolId as `0x${string}`],
  }) as Promise<readonly [bigint, number, number, number]>

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

  async mint(opts) {
    const token1 = opts.pool.currency1 as `0x${string}`
    const amount1 = await balanceOf(token1, opts.account.address)
    if (amount1 <= 0n) throw new Error('token1 balance 0 — swap belum settle?')

    const [sqrtPriceX96, tick] = await rawSlot0(opts.poolId) // harga LIVE (snapshot bisa basi)
    const { tickLower, tickUpper } = rangeFromWidth(tick, opts.pool.tick_spacing, opts.widthFactor)
    const raw = liquidityForAmounts(
      sqrtPriceX96,
      sqrtRatioX96AtTick(tickLower),
      sqrtRatioX96AtTick(tickUpper),
      opts.amount0Wei,
      amount1,
    )
    if (raw <= 0n) throw new Error('liquidity 0 (amount/range)')

    await ensureApprovals(opts.account, token1, amount1, ADDRESSES.clPositionManager)

    // Haircut adaptif (liquidity-math sqrt Math.pow overestimate L → settle revert):
    // coba haircut makin besar sampai preflight lolos (gratis), baru kirim.
    const mk = (L: bigint) =>
      encodeInfinityMint({
        pool: opts.pool,
        tickLower,
        tickUpper,
        liquidity: L,
        amount0Max: opts.amount0Wei,
        amount1Max: amount1,
        owner: opts.account.address,
        deadline: opts.deadline,
      })
    let chosen: { L: bigint; tx: ReturnType<typeof mk> } | null = null
    let lastErr: unknown
    for (const hc of [99n, 98n, 96n, 92n, 85n]) {
      const L = (raw * hc) / 100n
      if (L <= 0n) continue
      const tx = mk(L)
      try {
        await client.call({ account: opts.account.address, to: tx.to, data: tx.data, value: tx.value })
        chosen = { L, tx }
        break
      } catch (e) {
        lastErr = e
      }
    }
    if (!chosen) throw lastErr ?? new Error('mint preflight gagal di semua haircut')

    const wc = wcFor(opts.account)
    const hash = await wc.sendTransaction({ to: chosen.tx.to, data: chosen.tx.data, value: chosen.tx.value })
    const receipt = await client.waitForTransactionReceipt({ hash })
    return {
      hash,
      tokenId: tokenIdFromLogs(receipt.logs, ADDRESSES.clPositionManager),
      tickLower,
      tickUpper,
      liquidity: chosen.L,
      amount1,
      status: receipt.status,
    }
  },

  async burn(opts) {
    const tx = encodeInfinityBurn({
      tokenId: opts.tokenId,
      amount0Min: 0n,
      amount1Min: 0n,
      currency0: opts.currency0,
      currency1: opts.currency1,
      recipient: opts.account.address,
      deadline: opts.deadline,
    })
    await client.call({ account: opts.account.address, to: tx.to, data: tx.data, value: 0n }) // preflight
    const wc = wcFor(opts.account)
    const hash = await wc.sendTransaction({ to: tx.to, data: tx.data, value: 0n })
    const receipt = await client.waitForTransactionReceipt({ hash })
    return { hash, status: receipt.status }
  },

  async swapToNative(opts) {
    if (opts.pool.currency0 !== NATIVE) return null
    const token1 = opts.pool.currency1 as `0x${string}`
    const amountIn = await balanceOf(token1, opts.account.address)
    if (amountIn <= 0n) return null

    await ensureApprovals(opts.account, token1, amountIn, ADDRESSES.universalRouter)

    // minOut dari harga spot (slot0) × (1 − slippage). price=(sqrtP/Q96)²=token1/token0,
    // token0_out ≈ amountIn/price. ponytail: pakai spot (bukan CLQuoter) — cukup utk EXIT
    // posisi kecil; upgrade ke quoter kalau impact besar. Preflight menjaga dari revert.
    const [sqrtP] = await rawSlot0(
      // poolId dari PoolKey (reads pakai poolId tersimpan; di sini derive dari pool)
      infinityPoolId(opts.pool),
    )
    if (sqrtP <= 0n) return null
    const priceX192 = sqrtP * sqrtP // token1/token0 × 2^192
    const grossOut = (amountIn * Q96 * Q96) / priceX192 // token0 (native) sebelum impact/fee
    const minOut = (grossOut * (10_000n - SLIPPAGE_BPS)) / 10_000n

    const tx = encodeInfinitySwapToNative({ pool: opts.pool, amountInWei: amountIn, minOutWei: minOut, deadline: opts.deadline })
    await client.call({ account: opts.account.address, to: tx.to, data: tx.data, value: 0n }) // preflight
    const wc = wcFor(opts.account)
    const hash = await wc.sendTransaction({ to: tx.to, data: tx.data, value: 0n })
    const receipt = await client.waitForTransactionReceipt({ hash })
    return { hash, status: receipt.status, ethOut: grossOut, amountIn }
  },

  // --- scanner ---
  poolManagerAddress: ADDRESSES.clPoolManager,
  initializeEvent,
  swapEvent,

  decodeInitialize(a) {
    if (!a.id || !a.currency0 || !a.currency1) return null
    return {
      poolId: a.id as string,
      currency0: (a.currency0 as string).toLowerCase(),
      currency1: (a.currency1 as string).toLowerCase(),
      fee: Number(a.fee),
      tickSpacing: tickSpacingFromParameters(a.parameters as string),
      hooks: (a.hooks as string).toLowerCase(),
    }
  },

  async poolState(poolId) {
    try {
      const id = poolId as `0x${string}`
      const [slot0, liquidity, feeGrowth] = await Promise.all([
        rawSlot0(poolId),
        client.readContract({
          address: ADDRESSES.clPoolManager,
          abi: clPoolManagerAbi,
          functionName: 'getLiquidity',
          args: [id],
        }) as Promise<bigint>,
        client.readContract({
          address: ADDRESSES.clPoolManager,
          abi: clPoolManagerAbi,
          functionName: 'getFeeGrowthGlobals',
          args: [id],
        }) as Promise<readonly [bigint, bigint]>,
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
