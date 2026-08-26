import { openDb, getMeta } from '../../core/db.ts'
import { computeYields, materializeYields, passesGuards } from '../report/yield.ts'
import { decide, DEFAULT_STRATEGY } from './strategist.ts'
import { log } from '../../core/util.ts'

/**
 * Dry-run strategist: hitung keputusan dari data terkini, simpan ke tabel
 * decisions, tampilkan. TIDAK menyentuh wallet — executor fase terpisah.
 * Kill switch: `sqlite3 data/lp.db "INSERT OR REPLACE INTO meta VALUES('paused','1')"`
 */
export async function run() {
  const db = openDb()
  const all = computeYields(db)
  materializeYields(db, all) // refresh kontrak baca backoffice
  const candidates = all.filter(passesGuards)
  // held = pool dgn posisi OPEN nyata (token_id) → strategist bisa HOLD/EXIT, bukan cuma ENTER.
  const held = (
    db
      .prepare("SELECT DISTINCT pool_id FROM positions WHERE status = 'OPEN' AND token_id IS NOT NULL")
      .all() as { pool_id: string }[]
  ).map((r) => r.pool_id)
  const state = { paused: getMeta(db, 'paused') === '1', held }
  const decisions = decide(candidates, DEFAULT_STRATEGY, state)

  if (state.paused) {
    log('PAUSED — tidak ada keputusan (hapus meta "paused" untuk lanjut)')
    return
  }

  const ts = Math.floor(Date.now() / 1000)
  const ins = db.prepare(
    `INSERT OR REPLACE INTO decisions (ts, pool_id, action, width_factor, size_fraction, reason)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const d of decisions) ins.run(ts, d.poolId, d.action, d.widthFactor, d.sizeFraction, d.reason)

  log(`${candidates.length} kandidat lolos guard, ${decisions.length} keputusan:`)
  for (const d of decisions) {
    console.log(
      `${d.action.padEnd(6)} ${d.pair.padEnd(20)} size=${(d.sizeFraction * 100).toFixed(0)}%  ` +
      `range=±${((d.widthFactor - 1) * 100).toFixed(0)}%  ${d.reason}  ${d.poolId.slice(0, 18)}`,
    )
  }
  if (decisions.length === 0) log('tidak ada pool yang memenuhi gate strategi saat ini')
}
