import {
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  fallback,
  http,
  parseAbi,
  type Account,
} from 'viem'
import { client } from '../../core/chain.ts'
import { ACTIVE_CHAIN, ADDRESSES, NATIVE, RPC_URLS } from '../../config/index.ts'
import { encodeMintPosition, type PoolKeyLike } from './mint.ts'
import { encodeBurnPosition } from './burn.ts'
import { amountsForLiquidity, liquidityForAmounts, rangeFromWidth, sqrtRatioX96AtTick } from './liquidity-math.ts'

/**
 * Jalur LIVE v4: approval Permit2, mint, burn on-chain dari agent wallet.
 * Setiap tx di-preflight (`client.call`) dulu — kalau bakal revert, tak dikirim
 * (nol biaya, dana aman). token1 (ERC20) butuh 2 approval sekali seumur token:
 * token->Permit2 (ERC20 approve) lalu Permit2->PositionManager.
 */

const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
])
const permit2Abi = parseAbi([
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
  'function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
])
const stateViewAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getFeeGrowthInside(bytes32 poolId, int24 tickLower, int24 tickUpper) view returns (uint256 feeGrowthInside0X128, uint256 feeGrowthInside1X128)',
  'function getPositionInfo(bytes32 poolId, address owner, int24 tickLower, int24 tickUpper, bytes32 salt) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)',
])
const Q96_ = 2n ** 96n
const Q128_ = 2n ** 128n
const U256 = 2n ** 256n

export type PositionValue = {
  liquidity: bigint
  principalEth: number // nilai principal (token0+token1) dalam ETH, harga sekarang
  feesEth: number // fee terakumulasi (belum diklaim) dalam ETH
  valueEth: number // principal + fees
}

/**
 * Nilai NYATA posisi LP dari state on-chain (StateView): principal (amount0+amount1
 * dari liquidity & harga kini) + fee terakumulasi (Δ feeGrowthInside × L). Semua
 * dikonversi ke ETH pakai sqrtPrice kini. null kalau posisi sudah kosong (L=0).
 */
export async function positionValueLive(opts: {
  poolId: string
  tickLower: number
  tickUpper: number
  tokenId: bigint
}): Promise<PositionValue | null> {
  const sv = ADDRESSES.stateView as `0x${string}`
  const poolId = opts.poolId as `0x${string}`
  const salt = ('0x' + opts.tokenId.toString(16).padStart(64, '0')) as `0x${string}`
  const [slot0, posInfo, feeInside] = await Promise.all([
    client.readContract({ address: sv, abi: stateViewAbi, functionName: 'getSlot0', args: [poolId] }) as Promise<
      readonly [bigint, number, number, number]
    >,
    client.readContract({
      address: sv,
      abi: stateViewAbi,
      functionName: 'getPositionInfo',
      args: [poolId, ADDRESSES.positionManager, opts.tickLower, opts.tickUpper, salt],
    }) as Promise<readonly [bigint, bigint, bigint]>,
    client.readContract({
      address: sv,
      abi: stateViewAbi,
      functionName: 'getFeeGrowthInside',
      args: [poolId, opts.tickLower, opts.tickUpper],
    }) as Promise<readonly [bigint, bigint]>,
  ])
  const sqrtP = slot0[0]
  const [liquidity, fgi0Last, fgi1Last] = posInfo
  if (liquidity <= 0n || sqrtP <= 0n) return null

  const { amount0, amount1 } = amountsForLiquidity(
    sqrtP,
    sqrtRatioX96AtTick(opts.tickLower),
    sqrtRatioX96AtTick(opts.tickUpper),
    liquidity,
  )
  // fee = L × Δ feeGrowthInside / 2^128 (Δ unsigned, bisa wrap mod 2^256)
  const dfg0 = (feeInside[0] - fgi0Last + U256) % U256
  const dfg1 = (feeInside[1] - fgi1Last + U256) % U256
  const fee0 = (liquidity * dfg0) / Q128_
  const fee1 = (liquidity * dfg1) / Q128_

  // token1 (raw) → ETH-wei: /price, price = (sqrtP/Q96)^2 → ×Q96²/sqrtP²
  const toEth = (t1: bigint) => (t1 * Q96_ * Q96_) / (sqrtP * sqrtP)
  const principalWei = amount0 + toEth(amount1)
  const feesWei = fee0 + toEth(fee1)
  return {
    liquidity,
    principalEth: Number(principalWei) / 1e18,
    feesEth: Number(feesWei) / 1e18,
    valueEth: Number(principalWei + feesWei) / 1e18,
  }
}
const urAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'])
const quoterAbi = parseAbi([
  'function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
])
const COMMAND_V4_SWAP = '0x10'
const ACTIONS = '0x060c0f' // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
const SLIPPAGE_BPS = 100n // 1%

/** Calldata Universal Router: swap exact-in token1 (ERC20) -> ETH (currency0 native). */
function encodeV4SwapTokenToEth(
  pool: PoolKeyLike,
  amountInWei: bigint,
  minOutWei: bigint,
  deadline: bigint,
): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
  const c0 = pool.currency0 as `0x${string}`
  const c1 = pool.currency1 as `0x${string}`
  const swapParam = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [
      {
        poolKey: { currency0: c0, currency1: c1, fee: pool.fee, tickSpacing: pool.tick_spacing, hooks: pool.hooks as `0x${string}` },
        zeroForOne: false, // token1 -> token0(ETH)
        amountIn: amountInWei,
        amountOutMinimum: minOutWei,
        hookData: '0x',
      },
    ],
  )
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [c1, amountInWei]) // settle input token1
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [c0, minOutWei]) // take output ETH
  const input0 = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [ACTIONS, [swapParam, settle, take]])
  const data = encodeFunctionData({ abi: urAbi, functionName: 'execute', args: [COMMAND_V4_SWAP, [input0], deadline] })
  return { to: ADDRESSES.universalRouter, data, value: 0n }
}

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const MAX_UINT256 = (1n << 256n) - 1n
const MAX_UINT160 = (1n << 160n) - 1n
const MAX_UINT48 = (1n << 48n) - 1n

/** tokenId dari log Transfer mint (from = address 0) PositionManager. Pure — diuji. */
export function tokenIdFromLogs(
  logs: readonly { address: string; topics: readonly string[] }[],
  positionManager: string,
): bigint | null {
  const pm = positionManager.toLowerCase()
  for (const l of logs) {
    if (
      l.address.toLowerCase() === pm &&
      l.topics[0] === TRANSFER_TOPIC &&
      l.topics.length === 4 &&
      /^0x0{64}$/.test(l.topics[1] ?? '')
    ) {
      return BigInt(l.topics[3] as string)
    }
  }
  return null
}

// RPC kadang 429 pada burst — fallback berurutan + retry backoff supaya broadcast tembus.
// Chain aktif dari profil (config CHAIN) — bukan hardcode Robinhood, biar jalan di BSC juga.
const wcFor = (account: Account) =>
  createWalletClient({
    account,
    chain: ACTIVE_CHAIN,
    transport: fallback(
      RPC_URLS.map((url) => http(url, { retryCount: 8, retryDelay: 1000 })),
      { rank: false },
    ),
  })

/** Pastikan `spender` bisa menarik token via Permit2 (idempotent). Default PositionManager. */
async function ensureApprovals(
  account: Account,
  token1: `0x${string}`,
  needed: bigint,
  spender: `0x${string}` = ADDRESSES.positionManager,
) {
  const wc = wcFor(account)
  const a1 = (await client.readContract({
    address: token1,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [account.address, ADDRESSES.permit2],
  })) as bigint
  if (a1 < needed) {
    const h = await wc.sendTransaction({
      to: token1,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [ADDRESSES.permit2, MAX_UINT256] }),
    })
    await client.waitForTransactionReceipt({ hash: h })
  }
  const [amt, exp] = (await client.readContract({
    address: ADDRESSES.permit2,
    abi: permit2Abi,
    functionName: 'allowance',
    args: [account.address, token1, spender],
  })) as readonly [bigint, number, number]
  const nowS = Math.floor(Date.now() / 1000)
  if (amt < needed || Number(exp) < nowS + 60) {
    const h = await wc.sendTransaction({
      to: ADDRESSES.permit2,
      data: encodeFunctionData({
        abi: permit2Abi,
        functionName: 'approve',
        args: [token1, spender, MAX_UINT160, Number(MAX_UINT48)],
      }),
    })
    await client.waitForTransactionReceipt({ hash: h })
  }
}

/**
 * Swap seluruh saldo token1 agent kembali ke ETH (dipanggil setelah burn/EXIT
 * agar dana penuh balik jadi ETH & bisa di-withdraw). null kalau tak ada token1.
 */
export async function swapToEthLive(opts: {
  account: Account
  pool: PoolKeyLike
  deadline: bigint
}): Promise<{ hash: `0x${string}`; status: 'success' | 'reverted'; ethOut: bigint; amountIn: bigint } | null> {
  const token1 = opts.pool.currency1 as `0x${string}`
  if (opts.pool.currency0 !== NATIVE) return null
  const amountIn = (await client.readContract({
    address: token1,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [opts.account.address],
  })) as bigint
  if (amountIn <= 0n) return null

  await ensureApprovals(opts.account, token1, amountIn, ADDRESSES.universalRouter)

  const [quoted] = (await client.readContract({
    address: ADDRESSES.quoter,
    abi: quoterAbi,
    functionName: 'quoteExactInputSingle',
    args: [
      {
        poolKey: {
          currency0: opts.pool.currency0 as `0x${string}`,
          currency1: token1,
          fee: opts.pool.fee,
          tickSpacing: opts.pool.tick_spacing,
          hooks: opts.pool.hooks as `0x${string}`,
        },
        zeroForOne: false,
        exactAmount: amountIn,
        hookData: '0x',
      },
    ],
  })) as readonly [bigint, bigint]
  const minOut = (quoted * (10_000n - SLIPPAGE_BPS)) / 10_000n
  const tx = encodeV4SwapTokenToEth(opts.pool, amountIn, minOut, opts.deadline)
  await client.call({ account: opts.account.address, to: tx.to, data: tx.data, value: 0n }) // preflight
  const wc = wcFor(opts.account)
  const hash = await wc.sendTransaction({ to: tx.to, data: tx.data, value: 0n })
  const receipt = await client.waitForTransactionReceipt({ hash })
  return { hash, status: receipt.status, ethOut: quoted, amountIn } // ethOut = ETH diterima; amountIn = token1 dijual
}

export type MintLiveResult = {
  hash: `0x${string}`
  tokenId: bigint | null
  tickLower: number
  tickUpper: number
  liquidity: bigint
  amount1: bigint
  status: 'success' | 'reverted'
}

/**
 * Mint posisi LP on-chain: baca saldo token1 hasil swap, hitung range+liquidity,
 * approve (sekali), preflight, kirim. amount0 = ETH sisa (msg.value).
 */
export async function mintLive(opts: {
  account: Account
  poolId: string
  pool: PoolKeyLike
  amount0Wei: bigint
  widthFactor: number
  deadline: bigint
}): Promise<MintLiveResult> {
  const token1 = opts.pool.currency1 as `0x${string}`
  const amount1 = (await client.readContract({
    address: token1,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [opts.account.address],
  })) as bigint
  if (amount1 <= 0n) throw new Error('token1 balance 0 — swap belum settle?')

  // Harga LIVE dari StateView (snapshot bisa basi → range meleset).
  const [sqrtPriceX96, tick] = (await client.readContract({
    address: ADDRESSES.stateView as `0x${string}`,
    abi: stateViewAbi,
    functionName: 'getSlot0',
    args: [opts.poolId as `0x${string}`],
  })) as readonly [bigint, number, number, number]

  const { tickLower, tickUpper } = rangeFromWidth(tick, opts.pool.tick_spacing, opts.widthFactor)
  const raw = liquidityForAmounts(
    sqrtPriceX96,
    sqrtRatioX96AtTick(tickLower),
    sqrtRatioX96AtTick(tickUpper),
    opts.amount0Wei,
    amount1,
  )
  if (raw <= 0n) throw new Error('liquidity 0 (amount/range)')

  await ensureApprovals(opts.account, token1, amount1)

  // Haircut adaptif: liquidity-math pakai sqrt Math.pow (bukan TickMath bit-exact),
  // overestimate L → required amount > max → settle revert. Presisi beda per-pool/range,
  // jadi coba haircut makin besar sampai preflight lolos (gratis), baru kirim.
  const mkMint = (L: bigint) =>
    encodeMintPosition({
      pool: opts.pool,
      tickLower,
      tickUpper,
      liquidity: L,
      amount0Max: opts.amount0Wei,
      amount1Max: amount1,
      owner: opts.account.address,
      deadline: opts.deadline,
    })
  let chosen: { L: bigint; mint: ReturnType<typeof mkMint> } | null = null
  let lastErr: unknown
  for (const hc of [99n, 98n, 96n, 92n, 85n]) {
    const L = (raw * hc) / 100n
    if (L <= 0n) continue
    const mint = mkMint(L)
    try {
      await client.call({ account: opts.account.address, to: mint.to, data: mint.data, value: mint.value })
      chosen = { L, mint }
      break
    } catch (e) {
      lastErr = e
    }
  }
  if (!chosen) throw lastErr ?? new Error('mint preflight gagal di semua haircut')

  const wc = wcFor(opts.account)
  const hash = await wc.sendTransaction({
    to: chosen.mint.to,
    data: chosen.mint.data,
    value: chosen.mint.value,
  })
  const receipt = await client.waitForTransactionReceipt({ hash })
  return {
    hash,
    tokenId: tokenIdFromLogs(receipt.logs, ADDRESSES.positionManager),
    tickLower,
    tickUpper,
    liquidity: chosen.L,
    amount1,
    status: receipt.status,
  }
}

/** Tutup posisi on-chain by tokenId: preflight lalu kirim burn+take. */
export async function burnLive(opts: {
  account: Account
  tokenId: bigint
  currency0: `0x${string}`
  currency1: `0x${string}`
  deadline: bigint
}): Promise<{ hash: `0x${string}`; status: 'success' | 'reverted' }> {
  const burn = encodeBurnPosition({
    tokenId: opts.tokenId,
    amount0Min: 0n,
    amount1Min: 0n,
    currency0: opts.currency0,
    currency1: opts.currency1,
    recipient: opts.account.address,
    deadline: opts.deadline,
  })
  await client.call({ account: opts.account.address, to: burn.to, data: burn.data, value: 0n })
  const wc = wcFor(opts.account)
  const hash = await wc.sendTransaction({ to: burn.to, data: burn.data, value: 0n })
  const receipt = await client.waitForTransactionReceipt({ hash })
  return { hash, status: receipt.status }
}
