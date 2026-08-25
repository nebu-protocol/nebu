import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveRanking, type RankRow } from '../src/modules/report/rank.ts'
import { NATIVE } from '../src/config/index.ts'

const NOW = 1_756_100_000

function row(overrides: Partial<RankRow>): RankRow {
  return {
    pool_id: '0xpool',
    currency0: NATIVE,
    currency1: '0xtoken',
    hooks: NATIVE,
    fee: 3000,
    created_at: NOW - 7 * 86400,
    sym0: 'ETH',
    sym1: 'MEME',
    lp_fee: 3000,
    liquidity: '1000',
    swap_count: 360,
    volume0: (10n * 10n ** 18n).toString(), // 10 ETH
    window_s: 3600,
    ...overrides,
  }
}

test('deriveRanking: fee ETH/jam dihitung benar untuk pasangan ETH', () => {
  const [r] = deriveRanking([row({})], NOW, 10)
  assert.ok(r)
  // 10 ETH volume × 0.3% fee dalam window 1 jam = 0.03 ETH/jam
  assert.ok(Math.abs(r.feeEthPerH! - 0.03) < 1e-9, `feeEthPerH=${r.feeEthPerH}`)
  assert.equal(r.swapsPerH, 360)
  assert.ok(Math.abs(r.ageDays! - 7) < 0.01)
  assert.equal(r.pair, 'ETH/MEME')
})

test('deriveRanking: pool mati (liquidity 0) dan pool tanpa swap dibuang', () => {
  const ranked = deriveRanking(
    [row({ pool_id: '0xdead', liquidity: '0' }), row({ pool_id: '0xidle', swap_count: 0 })],
    NOW,
    10,
  )
  assert.equal(ranked.length, 0)
})

test('deriveRanking: flag dynamic fee dibaca dari fee statis pool (regresi)', () => {
  // bug lama: flag dibaca dari lp_fee snapshot, bukan field fee statis
  const [r] = deriveRanking([row({ fee: 0x800000, lp_fee: 5000 })], NOW, 10)
  assert.ok(r)
  assert.equal(r.dynFee, true)
  const [s] = deriveRanking([row({ fee: 3000 })], NOW, 10)
  assert.equal(s!.dynFee, false)
})

test('deriveRanking: pasangan non-ETH volEth null dan tersortir di bawah', () => {
  const ranked = deriveRanking(
    [
      row({ pool_id: '0xusd', currency0: '0xusdg', sym0: 'USDG' }),
      row({ pool_id: '0xeth' }),
    ],
    NOW,
    10,
  )
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0]!.poolId, '0xeth')
  assert.equal(ranked[1]!.volEth, null)
})

test('deriveRanking: sortir desc berdasar fee dan hormati topN', () => {
  const rows = [1, 5, 3].map((mult, i) =>
    row({ pool_id: `0x${i}`, volume0: (BigInt(mult) * 10n ** 18n).toString() }),
  )
  const ranked = deriveRanking(rows, NOW, 2)
  assert.equal(ranked.length, 2)
  assert.equal(ranked[0]!.poolId, '0x1') // volume 5 ETH
  assert.equal(ranked[1]!.poolId, '0x2') // volume 3 ETH
})
