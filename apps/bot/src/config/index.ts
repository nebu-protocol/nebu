import { type Chain, defineChain } from 'viem'

// ============================================================================
// MULTI-CHAIN / MULTI-DEX PROFILES
// Bot awalnya Uniswap v4 di Robinhood Chain. Pivot hackathon BNB: PancakeSwap
// Infinity (arsitektur kembar v4) di BSC sebagai PRIMARY & DEFAULT, Uniswap v4
// (Robinhood) sebagai FALLBACK. Chain aktif dipilih env CHAIN (default 'bsc').
// PENTING: deployment Robinhood yg live HARUS set CHAIN=robinhood di .env biar
// tak ke-switch. Adapter DEX (executor) bercabang di DEX_KIND.
// ============================================================================

export type DexKind = 'uniswap-v4' | 'pancake-infinity'

/**
 * Semua alamat kontrak DEX. Kunci non-opsional (hindari `| undefined` dari
 * noUncheckedIndexedAccess). Kunci yg tak dipakai satu DEX diisi ZERO — kode DEX
 * lain tak menyentuhnya (dispatch di DEX_KIND / adapter).
 */
export type Addresses = {
  // Uniswap v4
  poolManager: `0x${string}`
  stateView: `0x${string}`
  positionManager: `0x${string}`
  quoter: `0x${string}`
  // PancakeSwap Infinity
  vault: `0x${string}`
  clPoolManager: `0x${string}`
  binPoolManager: `0x${string}`
  clPositionManager: `0x${string}`
  clQuoter: `0x${string}`
  // shared
  universalRouter: `0x${string}`
  permit2: `0x${string}`
}

/** Permit2 kanonik (sama di semua chain EVM). */
const PERMIT2 = '0x000000000022D473030F116dDEE9F6B43aC78BA3' as const
const ZERO = '0x0000000000000000000000000000000000000000' as const

// --- Robinhood Chain (Uniswap v4) — profil default, TIDAK diubah ---
export const RPC_URL =
  process.env.ROBINHOOD_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com'

/**
 * Urutan fallback RPC Robinhood. Diverifikasi 2026-08-25:
 * - RPC resmi: semua method (getLogs satu-satunya di sini)
 * - PublicNode: eth_call/getBlock OK; SEMUA eth_getLogs ditolak (dianggap archive)
 * - dRPC gratis: tanpa eth_call & eth_getLogs — tidak dipakai
 */
const ROBINHOOD_RPC_URLS = [
  ...(process.env.ROBINHOOD_RPC_URL ? [process.env.ROBINHOOD_RPC_URL] : []),
  'https://rpc.mainnet.chain.robinhood.com',
  'https://robinhood-rpc.publicnode.com',
]

export const robinhoodChain = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: {
    default: { name: 'Blockscout', url: 'https://robinhoodchain.blockscout.com' },
  },
})

/** Uniswap v4 on Robinhood Chain — verified on-chain (eth_getCode) 2026-08-25. */
const ROBINHOOD_ADDRESSES: Addresses = {
  poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
  stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
  positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7',
  universalRouter: '0x8876789976decbfcbbbe364623c63652db8c0904',
  quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
  permit2: PERMIT2,
  // Infinity-only (tak dipakai di v4)
  vault: ZERO,
  clPoolManager: ZERO,
  binPoolManager: ZERO,
  clPositionManager: ZERO,
  clQuoter: ZERO,
}

// --- BNB Smart Chain (PancakeSwap Infinity CLAMM) — primary hackathon target ---
const BSC_RPC_URLS = [
  ...(process.env.BSC_RPC_URL ? [process.env.BSC_RPC_URL] : []),
  'https://bsc-dataseed.bnbchain.org',
  'https://bsc-rpc.publicnode.com',
  'https://bsc-dataseed1.defibit.io',
]

export const bscChain = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: BSC_RPC_URLS } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://bscscan.com' } },
})

const BSC_TESTNET_RPC_URLS = [
  ...(process.env.BSC_RPC_URL ? [process.env.BSC_RPC_URL] : []),
  'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
  'https://bsc-testnet-rpc.publicnode.com',
]

export const bscTestnetChain = defineChain({
  id: 97,
  name: 'BNB Smart Chain Testnet',
  nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
  rpcUrls: { default: { http: BSC_TESTNET_RPC_URLS } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://testnet.bscscan.com' } },
})

/**
 * PancakeSwap Infinity — verified from official dev docs (addresses.mdx, kolom
 * "BNB & Base" = mainnet). Vault = target settle/take (bukan PoolManager, beda dgn
 * Uniswap v4). CLQuoter untuk quote, CLPoolManager untuk baca slot0/posisi.
 */
const INFINITY_V4_ZEROS = { poolManager: ZERO, stateView: ZERO, positionManager: ZERO, quoter: ZERO }

const INFINITY_BSC_ADDRESSES: Addresses = {
  vault: '0x238a358808379702088667322f80aC48bAd5e6c4',
  clPoolManager: '0xa0FfB9c1CE1Fe56963B0321B32E7A0302114058b',
  binPoolManager: '0xC697d2898e0D09264376196696c51D7aBbbAA4a9',
  clPositionManager: '0x55f4c8abA71A1e923edC303eb4fEfF14608cC226',
  clQuoter: '0xd0737C9762912dD34c3271197E362Aa736Df0926',
  universalRouter: '0xd9C500DfF816a1Da21A48A732d3498Bf09dc9AEB',
  permit2: PERMIT2,
  ...INFINITY_V4_ZEROS,
}

const INFINITY_TESTNET_ADDRESSES: Addresses = {
  vault: '0x2CdB3EC82EE13d341Dc6E73637BE0Eab79cb79dD',
  clPoolManager: '0x36A12c70c9Cf64f24E89ee132BF93Df2DCD199d4',
  binPoolManager: '0xe71d2e0230cE0765be53A8A1ee05bdACF30F296B',
  clPositionManager: '0x77DedB52EC6260daC4011313DBEE09616d30d122',
  clQuoter: '0x5d544D0ad627a72d7Fb53c22D8888663FC5d5B0d',
  universalRouter: '0x87FD5305E6a40F378da124864B2D479c2028BD86',
  permit2: PERMIT2,
  ...INFINITY_V4_ZEROS,
}

export type ChainProfile = {
  name: string
  chain: Chain
  rpcUrls: string[]
  dex: DexKind
  addresses: Addresses
  /** wrapped-native address (WBNB/WETH) — Infinity pakai native langsung juga */
  weth?: `0x${string}`
  /**
   * Backfill discovery: kalau diset, scan HANYA `head - scanWindowBlocks` → head
   * (RPC publik BSC di-prune → tak bisa scan genesis/log lama). Undefined = scan dari
   * genesis (Robinhood, RPC arsip). Override eksplisit via env SCAN_START_BLOCK.
   */
  scanWindowBlocks?: number
  /** Perkiraan detik/blok (untuk konversi window jam→blok di activity). */
  blockSeconds: number
}

const PROFILES: Record<string, ChainProfile> = {
  robinhood: {
    name: 'robinhood',
    chain: robinhoodChain,
    rpcUrls: ROBINHOOD_RPC_URLS,
    dex: 'uniswap-v4',
    addresses: ROBINHOOD_ADDRESSES,
    blockSeconds: 0.1, // ~100ms/blok (L2 Orbit)
  },
  bsc: {
    name: 'bsc',
    chain: bscChain,
    rpcUrls: BSC_RPC_URLS,
    dex: 'pancake-infinity',
    addresses: INFINITY_BSC_ADDRESSES,
    weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    scanWindowBlocks: Number(process.env.SCAN_WINDOW_BLOCKS ?? 100_000), // ~3.5 hari @3s
    blockSeconds: 3, // ~3s/blok (BSC)
  },
  'bsc-testnet': {
    name: 'bsc-testnet',
    chain: bscTestnetChain,
    rpcUrls: BSC_TESTNET_RPC_URLS,
    dex: 'pancake-infinity',
    addresses: INFINITY_TESTNET_ADDRESSES,
    weth: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd', // tWBNB
    scanWindowBlocks: Number(process.env.SCAN_WINDOW_BLOCKS ?? 100_000),
    blockSeconds: 3,
  },
}

/** Chain aktif via env CHAIN (default 'bsc' = target hackathon; Robinhood live pin CHAIN=robinhood). */
export const CHAIN = process.env.CHAIN ?? 'bsc'
export const PROFILE: ChainProfile = PROFILES[CHAIN] ?? PROFILES.bsc!
export const DEX_KIND = PROFILE.dex
export const ACTIVE_CHAIN = PROFILE.chain
/** Alamat kontrak DEX untuk chain aktif (shape tergantung DEX_KIND). */
export const ADDRESSES: Addresses = PROFILE.addresses
/** Urutan fallback RPC untuk chain aktif. */
export const RPC_URLS = PROFILE.rpcUrls

export const NATIVE = '0x0000000000000000000000000000000000000000'

/** Ukuran minimal per posisi/rebalance dalam USD (default $1) — hindari dust. */
export const MIN_POSITION_USD = Number(process.env.MIN_POSITION_USD ?? 1)
// Sizing sadar-bankroll (riset exit): posisi ~$1 dimakan fee 2× swap + slippage → EV
// negatif. Target ukuran posisi ≥ ini biar lewat lantai biaya; di bankroll kecil = lebih
// sedikit posisi tapi cukup besar (riset: $6-20 → 1-2 posisi, bukan 6× $1).
export const TARGET_POSITION_USD = Number(process.env.TARGET_POSITION_USD ?? 3)

/**
 * Manajemen exit LP — PnL pool meme DIDOMINASI harga token (bukan fee), jadi kunci
 * cuan/anti-rugi adalah KAPAN keluar:
 *  - stopLoss: potong rugi sebelum token dump makin dalam.
 *  - takeProfit: kunci untung sebelum pump balik arah.
 *  - out-of-range: posisi di luar range = 0 fee + full IL (dana mati) → keluar.
 * ponytail: ambang tetap; nanti bisa adaptif per-volatilitas.
 */
export const EXIT = {
  stopLossPct: Number(process.env.EXIT_STOP_LOSS ?? -15), // net vs HODL <= ini → keluar
  // Trailing take-profit (riset: ride pemenang, jangan cap). Setelah untung ≥ arm,
  // kunci dgn keluar bila net retrace ≥ trail (poin persen) dari PUNCAK. Pemenang 3×
  // keluar ~2.4× alih-alih round-trip balik ke 0.
  takeProfitArmPct: Number(process.env.EXIT_TP_ARM ?? 25),
  takeProfitTrailPct: Number(process.env.EXIT_TP_TRAIL ?? 20),
  // Fail-safe stop harga: keluar bila harga token turun ≥ ini (%) dari entry, DIHITUNG
  // dari pergerakan tick saja — jalan walau net_pct (valuation) belum terisi. Cegah
  // posisi bleed diam-diam saat stop-loss net tak bisa dievaluasi.
  priceStopPct: Number(process.env.EXIT_PRICE_STOP ?? 20),
}

// Cooldown re-entry: setelah posisi di pool ditutup, tunggu segini sebelum boleh masuk
// lagi (hindari whipsaw balik ke pool yg baru di-stop-loss). BUKAN blok permanen —
// dulu pool yg pernah disentuh diblok selamanya → bot kehabisan pool → berhenti entry.
// 8j (naik dari 3j): universe pool sekarang besar (23 kandidat) jadi 8j tak menstarve,
// dan mengurangi churn (re-trade pool yg sama) → potong fee drag (~13% fund). Gate
// TVL-rising memastikan tetap ada entry berkualitas walau cooldown panjang.
export const REENTRY_COOLDOWN_S = Number(process.env.REENTRY_COOLDOWN_H ?? 8) * 3600

// Time-stop: tutup posisi yg > ini jam TAPI tak pernah "arm" take-profit (momentum tak
// muncul). Riset: momentum crypto decay cepat + LP diam = bleed LVR (negative carry).
export const MAX_HOLD_HOURS = Number(process.env.EXIT_MAX_HOLD_H ?? 48)

export const SCAN = {
  /** getLogs chunk sizing — adaptive: halve on RPC error, grow on quiet ranges. */
  initialChunk: 200_000n,
  minChunk: 1_000n,
  maxChunk: 2_000_000n,
  /** polite delay between chunks on the public RPC (ms) */
  chunkDelayMs: 120,
  /** parallel eth_call / getBlock requests */
  concurrency: 8,
} as const
