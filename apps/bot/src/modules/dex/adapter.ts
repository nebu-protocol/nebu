import type { DexKind } from '../../config/index.ts'
import type {
  BurnParams,
  MintParams,
  MintResult,
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
}
