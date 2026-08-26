import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveExitCfg, RISK_PRESETS } from '../src/modules/strategy/risk.ts'

const base = {
  risk_profile: null,
  risk_stop_loss: null,
  risk_price_stop: null,
  risk_tp_arm: null,
  risk_tp_trail: null,
}

test('resolveExitCfg: default (null) → safe', () => {
  assert.deepEqual(resolveExitCfg(base), RISK_PRESETS.safe)
})

test('resolveExitCfg: safe & aggressive → preset masing-masing', () => {
  assert.deepEqual(resolveExitCfg({ ...base, risk_profile: 'safe' }), RISK_PRESETS.safe)
  assert.deepEqual(resolveExitCfg({ ...base, risk_profile: 'aggressive' }), RISK_PRESETS.aggressive)
})

test('resolveExitCfg: aggressive lebih longgar dari safe (ruang lebih besar)', () => {
  assert.ok(RISK_PRESETS.aggressive.stopLossPct < RISK_PRESETS.safe.stopLossPct) // -30 < -12
  assert.ok(RISK_PRESETS.aggressive.takeProfitTrailPct > RISK_PRESETS.safe.takeProfitTrailPct)
})

test('resolveExitCfg: custom pakai kolom, kolom null fallback ke safe', () => {
  const cfg = resolveExitCfg({
    ...base,
    risk_profile: 'custom',
    risk_stop_loss: -20,
    risk_tp_trail: 25,
    // price_stop & tp_arm null → fallback safe
  })
  assert.equal(cfg.stopLossPct, -20)
  assert.equal(cfg.takeProfitTrailPct, 25)
  assert.equal(cfg.priceStopPct, RISK_PRESETS.safe.priceStopPct)
  assert.equal(cfg.takeProfitArmPct, RISK_PRESETS.safe.takeProfitArmPct)
})
