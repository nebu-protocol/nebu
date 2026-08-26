import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, getMeta, setMeta } from '../src/core/db.ts'
import { queryRankRows } from '../src/modules/report/rank.ts'
import { materializeYields, type YieldRow } from '../src/modules/report/yield.ts'
import { selectPoolsToSnapshot } from '../src/modules/scanner/snapshot.ts'
import { NATIVE } from '../src/config/index.ts'

function tmpDb() {
  return openDb(join(mkdtempSync(join(tmpdir(), 'lpbot-')), 'test.db'))
}

test('db: schema terbentuk dan meta roundtrip (cursor resume)', () => {
  const db = tmpDb()
  assert.equal(getMeta(db, 'backfill_cursor'), undefined)
  setMeta(db, 'backfill_cursor', '12345')
  setMeta(db, 'backfill_cursor', '67890') // upsert, bukan duplikat
  assert.equal(getMeta(db, 'backfill_cursor'), '67890')
})

test('db: insert pool idempotent (INSERT OR IGNORE pada re-scan)', () => {
  const db = tmpDb()
  const ins = db.prepare(
    `INSERT OR IGNORE INTO pools
     (pool_id, currency0, currency1, fee, tick_spacing, hooks, block_number, created_at, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  ins.run('0xp1', NATIVE, '0xt1', 3000, 60, NATIVE, 100, 1_756_000_000, '0xtx')
  ins.run('0xp1', NATIVE, '0xt1', 3000, 60, NATIVE, 100, 1_756_000_000, '0xtx')
  const n = db.prepare('SELECT COUNT(*) AS n FROM pools').get() as { n: number }
  assert.equal(n.n, 1)
})

test('db: position lifecycle OPEN -> CLOSED (tracking ENTER/EXIT)', () => {
  const db = tmpDb()
  db.prepare(
    `INSERT INTO positions (wallet, pool_id, token_id, tick_lower, tick_upper, liquidity, entry_ts, status)
     VALUES ('0xw', '0xp', NULL, -120, 120, '5000', 100, 'OPEN')`,
  ).run()
  const open = db.prepare(`SELECT id FROM positions WHERE status = 'OPEN'`).all() as { id: number }[]
  assert.equal(open.length, 1)
  db.prepare(`UPDATE positions SET status = 'CLOSED', exit_ts = 200 WHERE id = ?`).run(open[0]!.id)
  const stillOpen = db.prepare(`SELECT COUNT(*) AS n FROM positions WHERE status = 'OPEN'`).get() as {
    n: number
  }
  assert.equal(stillOpen.n, 0)
  const closed = db.prepare(`SELECT exit_ts FROM positions WHERE id = ?`).get(open[0]!.id) as {
    exit_ts: number
  }
  assert.equal(closed.exit_ts, 200)
})

test('db+snapshot: default hanya pool aktif (ada di swap_windows), "all" semua', () => {
  const db = tmpDb()
  const ins = db.prepare(
    `INSERT INTO pools (pool_id, currency0, currency1, fee, tick_spacing, hooks, block_number, created_at, tx_hash)
     VALUES (?, ?, '0xt1', 3000, 60, ?, 100, 1756000000, '0xtx')`,
  )
  ins.run('0xaktif', NATIVE, NATIVE)
  ins.run('0xmati', NATIVE, NATIVE)
  db.prepare(
    `INSERT INTO swap_windows (pool_id, from_block, to_block, from_ts, to_ts, swap_count, volume0, volume1)
     VALUES ('0xaktif', 1, 100, 0, 3600, 5, '1', '1')`,
  ).run()

  const active = selectPoolsToSnapshot(db, false)
  assert.deepEqual(active.map((p) => p.pool_id), ['0xaktif'])
  assert.equal(selectPoolsToSnapshot(db, true).length, 2)
})

test('db+yield: materializeYields mengganti isi tabel (kontrak baca backoffice)', () => {
  const db = tmpDb()
  const mk = (poolId: string, apr20: number, volEth: number): YieldRow => ({
    pair: 'ETH/X', ageDays: 10, apr20, apr5: apr20 * 3, feePerEthDay: 0.01,
    volEth, swapsPerH: 60, hook: '-', spanMin: 60, poolId, widthFactor: 1.2, momentumPct: 0, tvlTrendPct: 5,
  })
  materializeYields(db, [mk('0xa', 100, 50), mk('0xb', 200, 1)]) // 0xb gagal guard vol
  // node:sqlite mengembalikan row ber-prototype null — spread agar deepEqual apple-to-apple
  let rows: { pool_id: string; passes_guards?: number }[] = (
    db.prepare('SELECT pool_id, passes_guards FROM yield_rows ORDER BY pool_id').all() as
      { pool_id: string; passes_guards: number }[]
  ).map((r) => ({ ...r }))
  assert.deepEqual(rows, [
    { pool_id: '0xa', passes_guards: 1 },
    { pool_id: '0xb', passes_guards: 0 },
  ])
  materializeYields(db, [mk('0xc', 300, 50)]) // run kedua: isi lama terganti penuh
  rows = (db.prepare('SELECT pool_id FROM yield_rows').all() as { pool_id: string }[]).map((r) => ({
    ...r,
  }))
  assert.deepEqual(rows, [{ pool_id: '0xc' }])
})

test('db+rank: join memilih snapshot & window TERBARU per pool (regresi join)', () => {
  const db = tmpDb()
  db.prepare(
    `INSERT INTO pools (pool_id, currency0, currency1, fee, tick_spacing, hooks, block_number, created_at, tx_hash)
     VALUES ('0xp1', ?, '0xt1', 3000, 60, ?, 100, 1756000000, '0xtx')`,
  ).run(NATIVE, NATIVE)
  db.prepare(`INSERT INTO tokens (address, symbol, name, decimals) VALUES (?, 'ETH', 'Ether', 18)`).run(NATIVE)
  db.prepare(`INSERT INTO tokens (address, symbol, name, decimals) VALUES ('0xt1', 'MEME', 'Meme', 18)`).run()

  const snap = db.prepare(
    `INSERT INTO pool_snapshots (pool_id, ts, sqrt_price_x96, tick, lp_fee, liquidity, fee_growth0, fee_growth1)
     VALUES ('0xp1', ?, '1', 0, 3000, ?, '0', '0')`,
  )
  snap.run(1000, '111') // lama
  snap.run(2000, '222') // terbaru — ini yang harus terpilih

  const win = db.prepare(
    `INSERT INTO swap_windows (pool_id, from_block, to_block, from_ts, to_ts, swap_count, volume0, volume1)
     VALUES ('0xp1', ?, ?, 0, 3600, ?, '1000', '1000')`,
  )
  win.run(1, 100, 5) // lama
  win.run(101, 200, 42) // terbaru

  const rows = queryRankRows(db)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.liquidity, '222')
  assert.equal(rows[0]!.swap_count, 42)
  assert.equal(rows[0]!.sym1, 'MEME')
})
