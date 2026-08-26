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
    widthFactor: 1.2,
    momentumPct: 0,
    ...overrides,
  }
}

test('decide: gate menolak pool muda, ber-hook, APR rendah, dan token dump', () => {
  const out = decide(
    [
      row({ poolId: '0xyoung', ageDays: 1 }),
      row({ poolId: '0xhooked', hook: '0xdeadbeef' }),
      row({ poolId: '0xlowapr', apr20: 10 }),
      row({ poolId: '0xdump', momentumPct: -25 }), // token lagi dump → tolak
    ],
    cfg,
    { paused: false, held: [] },
  )
  assert.equal(out.length, 0)
})

test('decide: momentum — token naik masuk, token turun tajam ditolak', () => {
  const out = decide(
    [
      row({ poolId: '0xup', apr20: 200, momentumPct: 5 }),
      row({ poolId: '0xdown', apr20: 500, momentumPct: -30 }), // APR tinggi TAPI dump → skip
    ],
    { ...cfg, momentumMinPct: -8 },
    { paused: false, held: [] },
  )
  assert.deepEqual(
    out.map((d) => d.poolId),
    ['0xup'],
  )
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

test('decide: hurdle LVR — pool volatil (widthFactor tinggi) butuh APR lebih tinggi', () => {
  // hurdle = minAprPct × widthFactor². width 1.2 → 72; width 2 → 200.
  const out = decide(
    [
      row({ poolId: '0xcalm', apr20: 150, widthFactor: 1.2 }), // 150 ≥ 72 → lolos
      row({ poolId: '0xvol', apr20: 150, widthFactor: 2 }), // 150 < 200 → ditolak (LVR ∝ σ²)
    ],
    cfg,
    { paused: false, held: [] },
  )
  assert.deepEqual(
    out.map((d) => d.poolId),
    ['0xcalm'],
  )
})

test('decide: momentum default 0 — dump ringan (-1%) pun ditolak (LP cuma untung saat uptrend)', () => {
  const out = decide([row({ poolId: '0xslightdown', momentumPct: -1 })], cfg, { paused: false, held: [] })
  assert.equal(out.length, 0)
})
