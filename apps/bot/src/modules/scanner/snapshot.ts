import type { DatabaseSync } from 'node:sqlite'
import { client } from '../../core/chain.ts'
import { openDb } from '../../core/db.ts'
import { stateViewAbi, erc20Abi } from '../../contracts/abi.ts'
import { ADDRESSES, NATIVE, SCAN } from '../../config/index.ts'
import { log, mapLimit } from '../../core/util.ts'

/**
 * Snapshot state terkini pool AKTIF (harga, liquidity, feeGrowth) via StateView,
 * plus metadata token yang belum dikenal. Jalankan berkala (mis. per jam).
 * Default hanya pool yang muncul di swap_windows (ratusan ribu pool total,
 * mayoritas mati — snapshot semuanya = ~1jt eth_call). `snapshot all` untuk memaksa.
 */
export type PoolRef = { pool_id: string; currency0: string; currency1: string }

/** Pool yang layak di-snapshot: default hanya yang pernah muncul di swap_windows. */
export function selectPoolsToSnapshot(db: DatabaseSync, all: boolean): PoolRef[] {
  const where = all ? '' : 'WHERE pool_id IN (SELECT DISTINCT pool_id FROM swap_windows)'
  return db.prepare(`SELECT pool_id, currency0, currency1 FROM pools ${where}`).all() as PoolRef[]
}

export async function run(args: string[] = []) {
  const db = openDb()
  const pools = selectPoolsToSnapshot(db, args[0] === 'all')
  if (pools.length === 0) {
    log('tidak ada pool aktif — jalankan backfill lalu activity dulu')
    return
  }

  // metadata token baru
  const known = new Set(
    (db.prepare('SELECT address FROM tokens').all() as { address: string }[]).map((t) => t.address),
  )
  const unknown = [
    ...new Set(pools.flatMap((p) => [p.currency0, p.currency1])),
  ].filter((a) => !known.has(a))
  const insertToken = db.prepare(
    'INSERT OR IGNORE INTO tokens (address, symbol, name, decimals) VALUES (?, ?, ?, ?)',
  )
  log(`snapshot: ${pools.length} pools, ${unknown.length} token baru`)

  await mapLimit(unknown, SCAN.concurrency, async (addr) => {
    if (addr === NATIVE) {
      insertToken.run(addr, 'ETH', 'Ether', 18)
      return
    }
    const meta = { symbol: '?', name: '?', decimals: null as number | null }
    try {
      const c = { address: addr as `0x${string}`, abi: erc20Abi } as const
      const [symbol, name, decimals] = await Promise.all([
        client.readContract({ ...c, functionName: 'symbol' }),
        client.readContract({ ...c, functionName: 'name' }),
        client.readContract({ ...c, functionName: 'decimals' }),
      ])
      Object.assign(meta, { symbol, name, decimals })
    } catch {
      // token non-standar (bytes32 symbol / kontrak aneh) — biarkan '?'
    }
    insertToken.run(addr, meta.symbol, meta.name, meta.decimals)
  })

  const ts = Math.floor(Date.now() / 1000)
  const insertSnap = db.prepare(
    `INSERT OR REPLACE INTO pool_snapshots
     (pool_id, ts, sqrt_price_x96, tick, lp_fee, liquidity, fee_growth0, fee_growth1)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  let done = 0
  await mapLimit(pools, SCAN.concurrency, async (p) => {
    try {
      const sv = { address: ADDRESSES.stateView, abi: stateViewAbi } as const
      const poolId = p.pool_id as `0x${string}`
      const [slot0, liquidity, feeGrowth] = await Promise.all([
        client.readContract({ ...sv, functionName: 'getSlot0', args: [poolId] }),
        client.readContract({ ...sv, functionName: 'getLiquidity', args: [poolId] }),
        client.readContract({ ...sv, functionName: 'getFeeGrowthGlobals', args: [poolId] }),
      ])
      insertSnap.run(
        p.pool_id,
        ts,
        slot0[0].toString(),
        slot0[1],
        slot0[3],
        liquidity.toString(),
        feeGrowth[0].toString(),
        feeGrowth[1].toString(),
      )
    } catch {
      // pool bisa gagal dibaca (state aneh) — skip, jangan gagalkan seluruh snapshot
    }
    if (++done % 500 === 0) log(`snapshot ${done}/${pools.length}`)
  })
  log(`snapshot selesai: ${done} pools @ ts=${ts}`)
}
