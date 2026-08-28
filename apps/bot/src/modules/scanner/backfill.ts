import { client } from '../../core/chain.ts'
import { openDb, getMeta, setMeta } from '../../core/db.ts'
import { PROFILE, SCAN } from '../../config/index.ts'
import { getDexAdapter } from '../dex/index.ts'
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
  const dex = getDexAdapter()
  const latest = await client.getBlockNumber()
  // Start discovery: cursor (resume) → env SCAN_START_BLOCK → window (head - N, utk RPC
  // publik BSC yg tak melayani log genesis) → genesis (Robinhood, RPC arsip).
  const envStart = process.env.SCAN_START_BLOCK ? BigInt(process.env.SCAN_START_BLOCK) : null
  const windowStart =
    PROFILE.scanWindowBlocks != null && latest > BigInt(PROFILE.scanWindowBlocks)
      ? latest - BigInt(PROFILE.scanWindowBlocks)
      : 1n
  const defaultStart = envStart ?? windowStart
  let from = BigInt(getMeta(db, CURSOR_KEY) ?? defaultStart.toString())
  let chunk: bigint = SCAN.initialChunk
  let totalFound = 0

  // UPSERT (bukan INSERT OR IGNORE): baris pool LAMA (dibuat sebelum kolom `parameters` ada)
  // punya parameters NULL → tak bisa derive poolId pool BER-HOOK (bit hook-perms hilang) →
  // tx revert. Re-scan mengisi parameters EKSAK dari event Initialize saat masih NULL. Field
  // lain tak disentuh (immutable sejak Initialize).
  const insert = db.prepare(
    `INSERT INTO pools
     (pool_id, currency0, currency1, fee, tick_spacing, hooks, parameters, block_number, created_at, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pool_id) DO UPDATE SET parameters = excluded.parameters
       WHERE pools.parameters IS NULL AND excluded.parameters IS NOT NULL`,
  )
  // ponytail: timestamp diestimasi via interpolasi linear [from..head] (2 request, bukan 1
  // getBlock per pool — RPC publik 429). Galat ~menit. Anchor di `from` (bukan blok 1) biar
  // aman di node ter-prune (BSC publik tak punya state blok lama).
  const [startBlock, headBlock] = await Promise.all([
    client.getBlock({ blockNumber: from }),
    client.getBlock({ blockNumber: latest }),
  ])
  const rate = (Number(headBlock.timestamp) - Number(startBlock.timestamp)) / Number(latest - from || 1n)
  const estTs = (b: bigint) => Math.round(Number(startBlock.timestamp) + (Number(b) - Number(from)) * rate)

  log(`backfill (${dex.kind}): block ${from} -> ${latest} (${latest - from + 1n} blocks)`)

  while (from <= latest) {
    const to = bmin(from + chunk - 1n, latest)
    let logs
    try {
      logs = await client.getLogs({
        address: dex.poolManagerAddress,
        event: dex.initializeEvent,
        fromBlock: from,
        toBlock: to,
      })
    } catch (err) {
      chunk /= 2n
      if (chunk < SCAN.minChunk) throw err
      continue // retry range yang lebih kecil
    }

    for (const l of logs) {
      const p = dex.decodeInitialize((l as { args: Record<string, unknown> }).args)
      if (!p) continue
      insert.run(
        p.poolId,
        p.currency0,
        p.currency1,
        p.fee,
        p.tickSpacing,
        p.hooks,
        p.parameters ?? null,
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
