import { test } from 'node:test'
import assert from 'node:assert/strict'
import { positionPnl } from '../src/modules/report/pnl.ts'
import type { SnapPoint } from '../src/modules/report/yield.ts'

const Q96 = 2n ** 96n
const Q128 = 2n ** 128n

function snap(ts: number, sqrtX96: bigint, fg0: bigint, fg1: bigint): SnapPoint {
  return { ts, sqrt_price_x96: sqrtX96.toString(), fee_growth0: fg0.toString(), fee_growth1: fg1.toString() }
}

test('positionPnl: harga tetap + fee terkumpul -> IL 0, net = fees positif', () => {
  const entry = snap(0, Q96, 0n, 0n)
  const now = snap(86_400, Q96, Q128 / 1000n, Q128 / 1000n) // 0.001/L tiap sisi
  const r = positionPnl(entry, now, 1.2)
  assert.ok(r)
  assert.ok(Math.abs(r.ilPct) < 1e-6, `IL harusnya ~0, dapat ${r.ilPct}`)
  assert.ok(r.feesPct > 0)
  assert.ok(Math.abs(r.netPct - r.feesPct) < 1e-9)
  assert.equal(r.holdingDays, 1)
})

test('positionPnl: harga bergerak tanpa fee -> IL negatif, net negatif', () => {
  // harga naik 4x: sqrtPrice x2
  const entry = snap(0, Q96, 0n, 0n)
  const now = snap(86_400, Q96 * 2n, 0n, 0n)
  const r = positionPnl(entry, now, 1.2)
  assert.ok(r)
  assert.ok(Math.abs(r.priceChangePct - 300) < 1, `Δprice ~+300%, dapat ${r.priceChangePct}`)
  assert.ok(r.ilPct < 0, `IL harus negatif, dapat ${r.ilPct}`)
  assert.equal(r.feesPct, 0)
  assert.ok(r.netPct < 0)
})

test('positionPnl: IL simetris terhadap arah harga (naik vs turun proporsi sama)', () => {
  const up = positionPnl(snap(0, Q96, 0n, 0n), snap(100, Q96 * 2n, 0n, 0n), 1.2)!
  const down = positionPnl(snap(0, Q96 * 2n, 0n, 0n), snap(100, Q96, 0n, 0n), 1.2)!
  // r naik = 4, r turun = 0.25 -> IL full-range identik
  assert.ok(Math.abs(up.ilPct - down.ilPct) < 1e-6)
})

test('positionPnl: dt<=0, width<=1, atau feeGrowth mundur -> null', () => {
  assert.equal(positionPnl(snap(100, Q96, 0n, 0n), snap(0, Q96, 0n, 0n), 1.2), null)
  assert.equal(positionPnl(snap(0, Q96, 0n, 0n), snap(100, Q96, 0n, 0n), 1.0), null)
  assert.equal(positionPnl(snap(0, Q96, 5n, 0n), snap(100, Q96, 1n, 0n), 1.2), null)
})

test('positionPnl: fee besar bisa menutup IL -> net positif meski harga bergerak', () => {
  const entry = snap(0, Q96, 0n, 0n)
  // harga naik sedikit (sqrt x1.05) + fee besar
  const now = snap(86_400, (Q96 * 105n) / 100n, Q128 / 20n, Q128 / 20n)
  const r = positionPnl(entry, now, 1.2)!
  assert.ok(r.ilPct < 0 && r.feesPct > 0)
  assert.ok(r.netPct > 0, `fee besar harusnya menang: net ${r.netPct}`)
})
