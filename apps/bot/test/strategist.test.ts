import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decide, DEFAULT_STRATEGY, type StrategyConfig } from '../src/modules/strategy/strategist.ts'
import type { YieldRow } from '../src/modules/report/yield.ts'

const cfg: StrategyConfig = { ...DEFAULT_STRATEGY, minAgeDays: 3, minAprPct: 50, maxPools: 2 }

function row(overrides: Partial<YieldRow>): YieldRow {
  return {
    pair: 'ETH/OK',
    ageDays: 10,
    apr20: 100,
    apr5: 300,
    feePerEthDay: 0.003,
    volEth: 100,
    swapsPerH: 60,
    hook: '-',
    spanMin: 60,
    poolId: '0xok',
    ...overrides,
  }
}

test('decide: gate menolak pool muda, ber-hook, dan APR rendah', () => {
  const out = decide(
    [
      row({ poolId: '0xyoung', ageDays: 1 }),
      row({ poolId: '0xhooked', hook: '0xdeadbeef' }),
      row({ poolId: '0xlowapr', apr20: 10 }),
    ],
    cfg,
    { paused: false, held: [] },
  )
  assert.equal(out.length, 0)
})

test('decide: ENTER maksimal maxPools, urut APR tertinggi', () => {
  const out = decide(
    [
      row({ poolId: '0xa', apr20: 60 }),
      row({ poolId: '0xb', apr20: 300 }),
      row({ poolId: '0xc', apr20: 150 }),
    ],
    cfg,
    { paused: false, held: [] },
  )
  assert.deepEqual(out.map((d) => [d.action, d.poolId]), [
    ['ENTER', '0xb'],
    ['ENTER', '0xc'],
  ])
  assert.equal(out[0]!.sizeFraction, 0.5)
})

test('decide: held yang gagal gate -> EXIT, yang lolos -> HOLD, slot sisa diisi ENTER', () => {
  const out = decide(
    [
      row({ poolId: '0xheld-ok', apr20: 80 }),
      row({ poolId: '0xheld-bad', apr20: 5 }),
      row({ poolId: '0xnew', apr20: 200 }),
    ],
    cfg,
    { paused: false, held: ['0xheld-ok', '0xheld-bad'] },
  )
  const byAction = Object.fromEntries(out.map((d) => [d.poolId, d.action]))
  assert.equal(byAction['0xheld-ok'], 'HOLD')
  assert.equal(byAction['0xheld-bad'], 'EXIT')
  assert.equal(byAction['0xnew'], 'ENTER') // 1 slot tersisa dari maxPools=2
})

test('decide: held hilang dari data aktif -> EXIT (pool mati mendadak)', () => {
  const out = decide([], cfg, { paused: false, held: ['0xgone'] })
  assert.deepEqual(out.map((d) => [d.action, d.poolId]), [['EXIT', '0xgone']])
})

test('decide: paused -> tidak ada keputusan apa pun (kill switch)', () => {
  const out = decide([row({})], cfg, { paused: true, held: ['0xheld'] })
  assert.equal(out.length, 0)
})
