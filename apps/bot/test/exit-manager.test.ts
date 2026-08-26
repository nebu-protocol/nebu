import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exitReason } from '../src/modules/strategy/exit-manager.ts'

const CFG = { stopLossPct: -15, takeProfitPct: 40 }
// range [100, 200], harga in-range = 150
const IN = 150

test('exitReason: dalam range + PnL wajar → tahan (null)', () => {
  assert.equal(exitReason(5, IN, 100, 200, CFG), null)
  assert.equal(exitReason(-10, IN, 100, 200, CFG), null)
  assert.equal(exitReason(30, IN, 100, 200, CFG), null)
})

test('exitReason: stop-loss saat net ≤ ambang', () => {
  assert.ok(exitReason(-15, IN, 100, 200, CFG)?.startsWith('stop-loss'))
  assert.ok(exitReason(-40, IN, 100, 200, CFG)?.startsWith('stop-loss'))
})

test('exitReason: take-profit saat net ≥ ambang', () => {
  assert.ok(exitReason(40, IN, 100, 200, CFG)?.startsWith('take-profit'))
  assert.ok(exitReason(88, IN, 100, 200, CFG)?.startsWith('take-profit'))
})

test('exitReason: out-of-range (harga di luar) → keluar walau net wajar', () => {
  assert.ok(exitReason(5, 90, 100, 200, CFG)?.startsWith('out-of-range')) // di bawah
  assert.ok(exitReason(5, 250, 100, 200, CFG)?.startsWith('out-of-range')) // di atas
})

test('exitReason: net null (PnL belum dihitung) → cuma cek range', () => {
  assert.equal(exitReason(null, IN, 100, 200, CFG), null)
  assert.ok(exitReason(null, 90, 100, 200, CFG)?.startsWith('out-of-range'))
})

test('exitReason: stop-loss diprioritaskan sebelum out-of-range', () => {
  // rugi DAN out-of-range → alasan stop-loss (paling mendesak)
  assert.ok(exitReason(-20, 90, 100, 200, CFG)?.startsWith('stop-loss'))
})
