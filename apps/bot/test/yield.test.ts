import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projectApr, type SnapPoint } from '../src/modules/report/yield.ts'

const Q96 = 2n ** 96n
const Q128 = 2n ** 128n

// harga 1:1 (sqrtPrice = 2^96), fee growth naik 0.0001 token/L di kedua sisi dalam 1 jam
function points(overrides: Partial<SnapPoint> = {}): [SnapPoint, SnapPoint] {
  const base: SnapPoint = {
    ts: 1000,
    sqrt_price_x96: Q96.toString(),
    fee_growth0: '0',
    fee_growth1: '0',
  }
  const later: SnapPoint = {
    ts: 4600,
    sqrt_price_x96: Q96.toString(),
    fee_growth0: (Q128 / 10_000n).toString(),
    fee_growth1: (Q128 / 10_000n).toString(),
    ...overrides,
  }
  return [base, later]
}

test('projectApr: cocok dengan closed form pada harga 1:1', () => {
  // width 1.21 -> sqrt 1.1: amount0PerL = amount1PerL = 0.0909..; modal = 0.181818 token0
  // fee = 0.0002 token0/L per jam -> APR = 0.0002*8760/0.181818 = 963.6%
  const [a, b] = points()
  const r = projectApr(a, b, 1.21)
  assert.ok(r)
  assert.ok(Math.abs(r.aprPct - 963.6) < 0.5, `apr=${r.aprPct}`)
  // fee harian per 1 ETH modal: 0.0002*24/0.181818 = 0.0264
  assert.ok(Math.abs(r.feePerEthPerDay - 0.0264) < 0.0005, `fee/d=${r.feePerEthPerDay}`)
})

test('projectApr: range lebih sempit -> APR lebih tinggi (properti dasar CL)', () => {
  const [a, b] = points()
  const wide = projectApr(a, b, 1.44)!
  const tight = projectApr(a, b, 1.02)!
  assert.ok(tight.aprPct > wide.aprPct)
})

test('projectApr: delta negatif / dt nol / width invalid -> null (regresi anomali data)', () => {
  const [a, b] = points()
  assert.equal(projectApr(b, a, 1.2), null) // urutan terbalik => dt negatif
  assert.equal(projectApr(a, { ...b, fee_growth0: '-1' }, 1.2), null)
  assert.equal(projectApr(a, { ...b, ts: a.ts }, 1.2), null)
  assert.equal(projectApr(a, b, 1.0), null)
})

test('projectApr: tanpa fee growth -> APR 0, bukan error', () => {
  const [a, b] = points({ fee_growth0: '0', fee_growth1: '0' })
  const r = projectApr(a, b, 1.2)
  assert.ok(r)
  assert.equal(r.aprPct, 0)
})
