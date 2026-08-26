import { defineChain } from 'viem'

export const RPC_URL =
  process.env.ROBINHOOD_RPC_URL ?? 'https://rpc.mainnet.chain.robinhood.com'

/**
 * Urutan fallback. Diverifikasi 2026-08-25:
 * - RPC resmi: semua method (getLogs satu-satunya di sini)
 * - PublicNode: eth_call/getBlock OK; SEMUA eth_getLogs ditolak (dianggap archive)
 * - dRPC gratis: tanpa eth_call & eth_getLogs — tidak dipakai
 */
export const RPC_URLS = [
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
export const ADDRESSES = {
  poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
  stateView: '0xf3334192d15450cdd385c8b70e03f9a6bd9e673b',
  positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7',
  universalRouter: '0x8876789976decbfcbbbe364623c63652db8c0904',
  quoter: '0x8dc178efb8111bb0973dd9d722ebeff267c98f94',
  permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3',
} as const

export const NATIVE = '0x0000000000000000000000000000000000000000'

/** Ukuran minimal per posisi/rebalance dalam USD (default $1) — hindari dust. */
export const MIN_POSITION_USD = Number(process.env.MIN_POSITION_USD ?? 1)

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
  takeProfitPct: Number(process.env.EXIT_TAKE_PROFIT ?? 40), // net vs HODL >= ini → keluar
}

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
