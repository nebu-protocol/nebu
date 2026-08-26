import { test } from 'node:test'
import assert from 'node:assert/strict'
import { edgeStats } from '../src/modules/report/edge-check.ts'

test('edgeStats: ratio = avgWin / |avgLoss|', () => {
  // 2 win (+90,+100), 8 loss (-35 each) → avgWin 95, avgLoss 35, ratio ~2.71
  const nets = [90, 100, -35, -35, -35, -35, -35, -35, -35, -35]
  const s = edgeStats(nets)
  assert.equal(s.sample, 10)
  assert.equal(s.winRate, 0.2)
  assert.equal(s.avgWin, 95)
  assert.equal(s.avgLoss, 35)
  assert.ok(Math.abs(s.ratio! - 95 / 35) < 1e-9)
  assert.ok(s.ratio! < 4.2) // edge tipis
})

test('edgeStats: sehat saat rasio ≥ 4.2', () => {
  const nets = [100, 100, -20, -20, -20, -20, -20, -20, -20, -20] // avgW100 avgL20 → 5:1
  const s = edgeStats(nets)
  assert.ok(s.ratio! >= 4.2)
})

test('edgeStats: belum ada loss → ratio null (jangan klaim sehat)', () => {
  assert.equal(edgeStats([10, 20, 30]).ratio, null)
})

test('edgeStats: kosong → nol aman, ratio null', () => {
  const s = edgeStats([])
  assert.equal(s.sample, 0)
  assert.equal(s.winRate, 0)
  assert.equal(s.ratio, null)
})
