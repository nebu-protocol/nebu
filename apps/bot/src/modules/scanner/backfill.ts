import { client } from '../../core/chain.ts'
import { openDb, getMeta, setMeta } from '../../core/db.ts'
import { initializeEvent } from '../../contracts/abi.ts'
import { ADDRESSES, SCAN } from '../../config/index.ts'
import { bmin, log, sleep } from '../../core/util.ts'

const CURSOR_KEY = 'backfill_cursor'

/** Estimasi timestamp blok via interpolasi linear antara blok 1 dan head. */
export function makeTsEstimator(t0: number, tHead: number, latestBlock: bigint) {
  const rate = (tHead - t0) / Number(latestBlock - 1n)
  return (b: bigint) => Math.round(t0 + (Number(b) - 1) * rate)
}

/**
 * Backfill semua event Initialize (pembuatan pool v4) dari genesis sampai head.
 * Resume-able: cursor disimpan di tabel meta, aman di-Ctrl+C kapan saja.
 */
export async function run() {
  const db = openDb()
  const latest = await client.getBlockNumber()
  let from = BigInt(getMeta(db, CURSOR_KEY) ?? 1)
  let chunk: bigint = SCAN.initialChunk
  let totalFound = 0

  const insert = db.prepare(
    `INSERT OR IGNORE INTO pools
     (pool_id, currency0, currency1, fee, tick_spacing, hooks, block_number, created_at, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  // ponytail: timestamp diestimasi via interpolasi linear blok-1..head (2 request,
  // bukan 1 getBlock per pool — public RPC 429). Galat ~menit; upgrade: RPC berbayar.
  const [genesisBlock, headBlock] = await Promise.all([
    client.getBlock({ blockNumber: 1n }),
    client.getBlock({ blockNumber: latest }),
  ])
  const estTs = makeTsEstimator(Number(genesisBlock.timestamp), Number(headBlock.timestamp), latest)

  log(`backfill: block ${from} -> ${latest} (${latest - from + 1n} blocks)`)

  while (from <= latest) {
    const to = bmin(from + chunk - 1n, latest)
    let logs
    try {
      logs = await client.getLogs({
        address: ADDRESSES.poolManager,
        event: initializeEvent,
        fromBlock: from,
        toBlock: to,
      })
    } catch (err) {
      chunk /= 2n
      if (chunk < SCAN.minChunk) throw err
      continue // retry range yang lebih kecil
    }

    for (const l of logs) {
      const a = l.args
      insert.run(
        a.id!,
        a.currency0!.toLowerCase(),
        a.currency1!.toLowerCase(),
        a.fee!,
        a.tickSpacing!,
        a.hooks!.toLowerCase(),
        Number(l.blockNumber),
        estTs(l.blockNumber),
        l.transactionHash,
      )
    }
    totalFound += logs.length
    setMeta(db, CURSOR_KEY, String(to + 1n))

    const pct = Number(((to * 100n) / latest)).toFixed(1)
    log(`blocks ${from}-${to} (${pct}%): +${logs.length} pools (total ${totalFound})`)

    from = to + 1n
    if (logs.length < 2000) chunk = bmin(chunk * 2n, SCAN.maxChunk)
    await sleep(SCAN.chunkDelayMs)
  }

  const count = db.prepare('SELECT COUNT(*) AS n FROM pools').get() as { n: number }
  log(`backfill selesai. total pools di DB: ${count.n}`)
}
