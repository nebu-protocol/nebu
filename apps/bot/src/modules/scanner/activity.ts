import { client } from '../../core/chain.ts'
import { openDb } from '../../core/db.ts'
import { swapEvent } from '../../contracts/abi.ts'
import { ADDRESSES, SCAN } from '../../config/index.ts'
import { bmin, log, sleep } from '../../core/util.ts'

const abs = (x: bigint) => (x < 0n ? -x : x)

export type SwapLike = { id: string; amount0: bigint; amount1: bigint }
export type SwapAgg = { count: number; vol0: bigint; vol1: bigint }

/** Agregasi swap per pool: hitung jumlah + volume absolut kedua sisi. */
export function aggregateSwaps(swaps: Iterable<SwapLike>, into = new Map<string, SwapAgg>()) {
  for (const s of swaps) {
    const agg = into.get(s.id) ?? { count: 0, vol0: 0n, vol1: 0n }
    agg.count++
    agg.vol0 += abs(s.amount0)
    agg.vol1 += abs(s.amount1)
    into.set(s.id, agg)
  }
  return into
}

/**
 * Agregasi event Swap per pool dalam satu window waktu (default 1 jam terakhir).
 * Pemakaian: activity [jam]
 */
export async function run(args: string[]) {
  const hours = Number(args[0] ?? 1)
  const db = openDb()

  const latestBlock = await client.getBlock()
  const latest = latestBlock.number
  // ponytail: konversi jam->blok pakai nominal 100ms/blok; window pendek, drift kecil
  const span = BigInt(Math.round(hours * 3600 * 10))
  const fromBlock = latest > span ? latest - span : 1n
  const fromTs = Number(latestBlock.timestamp) - Math.round(hours * 3600)

  const perPool = new Map<string, SwapAgg>()

  let from = fromBlock
  let chunk = 20_000n
  let total = 0
  log(`activity: window ${hours}h, blocks ${fromBlock} -> ${latest}`)

  while (from <= latest) {
    const to = bmin(from + chunk - 1n, latest)
    let logs
    try {
      logs = await client.getLogs({
        address: ADDRESSES.poolManager,
        event: swapEvent,
        fromBlock: from,
        toBlock: to,
      })
    } catch (err) {
      chunk /= 2n
      if (chunk < 500n) throw err
      continue
    }
    aggregateSwaps(
      logs.map((l) => ({ id: l.args.id!, amount0: l.args.amount0!, amount1: l.args.amount1! })),
      perPool,
    )
    total += logs.length
    log(`blocks ${from}-${to}: +${logs.length} swaps (total ${total})`)
    from = to + 1n
    if (logs.length < 5000) chunk = bmin(chunk * 2n, 200_000n)
    await sleep(SCAN.chunkDelayMs)
  }

  const insert = db.prepare(
    `INSERT OR REPLACE INTO swap_windows
     (pool_id, from_block, to_block, from_ts, to_ts, swap_count, volume0, volume1)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const [poolId, agg] of perPool) {
    insert.run(
      poolId,
      Number(fromBlock),
      Number(latest),
      fromTs,
      Number(latestBlock.timestamp),
      agg.count,
      agg.vol0.toString(),
      agg.vol1.toString(),
    )
  }
  log(`activity selesai: ${total} swaps di ${perPool.size} pools aktif`)
}
