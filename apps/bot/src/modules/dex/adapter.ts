import type { AbiEvent } from 'viem'
import type { DexKind } from '../../config/index.ts'
import type {
  BurnParams,
  Encoded,
  MintParams,
  MintResult,
  PoolInit,
  PoolRef,
  PoolState,
  PositionValue,
  PositionValueParams,
  Slot0,
  SwapParams,
  SwapResult,
  TxResult,
} from './types.ts'

/**
 * Abstraksi satu DEX likuiditas-terkonsentrasi (CLMM). Semua operasi on-chain
 * yang DEX-specific lewat sini, jadi strategi/executor buta-DEX. Implementasi:
 *  - UniswapV4Adapter  (Robinhood Chain — fallback; membungkus jalur live v4)
 *  - PancakeInfinityAdapter (BSC — primary; hackathon BNB)
 *
 * Kontrak minimal yang dibutuhkan bot: baca harga & nilai posisi, mint/burn,
 * swap balik ke native. Encoding PoolKey/PoolId & target settle (PoolManager vs
 * Vault) disembunyikan di dalam masing-masing adapter.
 */
export interface DexAdapter {
  readonly kind: DexKind

  // --- reads (tanpa dana) ---
  /** Harga & tick pool sekarang; null kalau gagal baca. */
  getSlot0(poolId: string): Promise<Slot0 | null>
  /** Nilai posisi (principal + fee) dari state on-chain; null kalau L=0. */
  positionValue(p: PositionValueParams): Promise<PositionValue | null>

  // --- writes (butuh key agent; live) ---
  /** Mint posisi LP; range dihitung dari harga live + widthFactor. */
  mint(p: MintParams): Promise<MintResult>
  /** Tutup posisi by tokenId. */
  burn(p: BurnParams): Promise<TxResult>
  /** Swap seluruh saldo token1 agent balik ke native; null kalau tak ada token1. */
  swapToNative(p: SwapParams): Promise<SwapResult | null>
  /** Quote token1 keluar untuk amountIn native (untuk minOut + cek keterjangkauan harga); null = tak bisa di-price. */
  quoteFromNative(pool: PoolRef, amountInWei: bigint): Promise<bigint | null>
  /** Calldata swap native → token1 (leg ENTER); executor yg preflight + kirim. */
  encodeSwapFromNative(pool: PoolRef, amountInWei: bigint, minOutWei: bigint, deadline: bigint): Encoded

  // --- scanner (discovery + state) ---
  /** Kontrak sumber event pool (PoolManager v4 / CLPoolManager Infinity). */
  readonly poolManagerAddress: `0x${string}`
  /** Event Initialize (pembuatan pool) untuk filter getLogs. */
  readonly initializeEvent: AbiEvent
  /** Event Swap (aktivitas) untuk filter getLogs. */
  readonly swapEvent: AbiEvent
  /** Normalisasi args log Initialize → PoolInit; null kalau bukan pool valid. */
  decodeInitialize(args: Record<string, unknown>): PoolInit | null
  /** State pool untuk snapshot (harga, likuiditas, feeGrowth); null kalau gagal. */
  poolState(poolId: string): Promise<PoolState | null>
}
