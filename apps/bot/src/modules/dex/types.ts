import type { Account } from 'viem'

/**
 * Tipe kanonik lintas-DEX. Interface `DexAdapter` (adapter.ts) memakai tipe ini,
 * jadi kode strategi/executor tak bergantung pada DEX tertentu. Uniswap v4 &
 * PancakeSwap Infinity dua-duanya mengimplementasi bentuk yang sama.
 */

/** Referensi pool = baris DB pools (identik bentuknya dgn PoolKeyLike v4). */
export type PoolRef = {
  currency0: string
  currency1: string
  fee: number
  tick_spacing: number
  hooks: string
}

/** Harga & tick pool saat ini. */
export type Slot0 = { sqrtPriceX96: bigint; tick: number }

/** Nilai NYATA posisi LP (principal + fee terakumulasi) dalam native (ETH/BNB). */
export type PositionValue = {
  liquidity: bigint
  principalEth: number
  feesEth: number
  valueEth: number
}

export type TxResult = { hash: `0x${string}`; status: 'success' | 'reverted' }
export type MintResult = TxResult & {
  tokenId: bigint | null
  tickLower: number
  tickUpper: number
  liquidity: bigint
  amount1: bigint
}
export type SwapResult = TxResult & { ethOut: bigint; amountIn: bigint }

export type MintParams = {
  account: Account
  poolId: string
  pool: PoolRef
  amount0Wei: bigint
  widthFactor: number
  deadline: bigint
}
export type BurnParams = {
  account: Account
  tokenId: bigint
  currency0: `0x${string}`
  currency1: `0x${string}`
  deadline: bigint
}
export type SwapParams = { account: Account; pool: PoolRef; deadline: bigint }
export type PositionValueParams = {
  poolId: string
  tickLower: number
  tickUpper: number
  tokenId: bigint
}

/** Pool baru dari event Initialize (dinormalisasi lintas-DEX). */
export type PoolInit = {
  poolId: string
  currency0: string
  currency1: string
  fee: number
  tickSpacing: number
  hooks: string
}

/** State pool untuk snapshot (harga, likuiditas, feeGrowth global). */
export type PoolState = {
  sqrtPriceX96: bigint
  tick: number
  lpFee: number
  liquidity: bigint
  feeGrowthGlobal0: bigint
  feeGrowthGlobal1: bigint
}
