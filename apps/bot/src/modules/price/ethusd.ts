import { openDb, setMeta } from '../../core/db.ts'
import { log } from '../../core/util.ts'

/**
 * Harga ETH/USD dari beberapa price feed publik dengan fallback berurutan,
 * disimpan ke meta (eth_usd) tiap siklus. Backoffice cukup baca meta — tidak
 * memukul API eksternal per-render (hindari rate limit). Fallback terakhir:
 * pool ETH/USDG on-chain.
 */
type Source = { name: string; url: string; pick: (j: unknown) => number }

const SOURCES: Source[] = [
  {
    name: 'coinbase',
    url: 'https://api.coinbase.com/v2/prices/ETH-USD/spot',
    pick: (j) => Number((j as { data: { amount: string } }).data.amount),
  },
  {
    name: 'binance',
    url: 'https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT',
    pick: (j) => Number((j as { price: string }).price),
  },
  {
    name: 'kraken',
    url: 'https://api.kraken.com/0/public/Ticker?pair=ETHUSD',
    pick: (j) => {
      const res = (j as { result: Record<string, { c: string[] }> }).result
      return Number(Object.values(res)[0]!.c[0])
    },
  },
  {
    name: 'coingecko',
    url: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
    pick: (j) => Number((j as { ethereum: { usd: number } }).ethereum.usd),
  },
]

async function fromApis(): Promise<{ price: number; source: string } | null> {
  for (const s of SOURCES) {
    try {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue
      const price = s.pick(await res.json())
      if (price > 0 && Number.isFinite(price)) return { price, source: s.name }
    } catch {
      // sumber ini gagal — coba berikutnya
    }
  }
  return null
}

/** Fallback: harga ETH dari pool ETH/USDG terdalam (raw * 10^(18-decUSDG)). */
export function ethUsdFromChain(db: ReturnType<typeof openDb>): number | null {
  const row = db
    .prepare(
      `SELECT s.sqrt_price_x96 AS sp, t1.decimals AS dec1
       FROM pools p JOIN tokens t1 ON t1.address = p.currency1
       JOIN pool_snapshots s ON s.pool_id = p.pool_id
         AND s.ts = (SELECT MAX(ts) FROM pool_snapshots WHERE pool_id = p.pool_id)
       WHERE p.currency0 = '0x0000000000000000000000000000000000000000' AND t1.symbol = 'USDG'
       ORDER BY CAST(s.liquidity AS REAL) DESC LIMIT 1`,
    )
    .get() as { sp: string; dec1: number } | undefined
  if (!row?.dec1) return null
  const sqrtP = Number(BigInt(row.sp)) / 2 ** 96
  const price = sqrtP * sqrtP * 10 ** (18 - row.dec1)
  return price > 0 && Number.isFinite(price) ? price : null
}

export async function run() {
  const db = openDb()
  const api = await fromApis()
  let price = api?.price ?? null
  let source = api?.source ?? ''
  if (price === null) {
    price = ethUsdFromChain(db)
    source = 'onchain-usdg'
  }
  if (price === null) {
    log('gagal dapat harga ETH/USD dari semua sumber')
    return
  }
  setMeta(db, 'eth_usd', String(price))
  setMeta(db, 'eth_usd_source', source)
  setMeta(db, 'eth_usd_ts', String(Math.floor(Date.now() / 1000)))
  log(`ETH/USD = ${price.toFixed(2)} (${source})`)
}
