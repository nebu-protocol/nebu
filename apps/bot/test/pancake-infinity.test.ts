import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeInfinityBurn,
  encodeInfinityMint,
  encodeInfinitySwapFromNative,
  encodeInfinitySwapToNative,
  encodeParameters,
  resolveParameters,
} from '../src/modules/dex/pancake-infinity-encode.ts'
import { ensureParameters, infinityPoolId } from '../src/modules/dex/pancake-infinity.ts'
import { ADDRESSES, NATIVE } from '../src/config/index.ts'

// Tes berjalan di profil default (CHAIN=bsc) → ADDRESSES = PancakeSwap Infinity.
const pool = {
  currency0: NATIVE,
  currency1: '0x1111111111111111111111111111111111111111',
  fee: 500,
  tick_spacing: 10,
  hooks: '0x0000000000000000000000000000000000000000',
}
const owner = '0x2222222222222222222222222222222222222222' as const

test('encodeParameters: tickSpacing di bit [16,40)', () => {
  assert.equal(encodeParameters(10), `0x${(10n << 16n).toString(16).padStart(64, '0')}`)
  assert.equal(encodeParameters(60), `0x${(60n << 16n).toString(16).padStart(64, '0')}`)
})

test('resolveParameters: pakai raw bytes32 tersimpan (hook) / derive dari tickSpacing (no-hook)', () => {
  const hooked = `0x${((10n << 16n) | 0x0005n).toString(16).padStart(64, '0')}` // tickSpacing 10 + hook-perms
  assert.equal(resolveParameters({ ...pool, parameters: hooked }), hooked) // pakai raw
  assert.equal(resolveParameters({ ...pool, parameters: null }), encodeParameters(pool.tick_spacing)) // derive
  assert.equal(resolveParameters({ ...pool, parameters: 'bad' }), encodeParameters(pool.tick_spacing)) // invalid → derive
})

test('ensureParameters: parameters tersimpan valid → passthrough (tak sentuh jaringan)', async () => {
  const stored = `0x${((10n << 16n) | 0xc2n).toString(16).padStart(64, '0')}`
  const p = { ...pool, hooks: '0x32C59D556B16DB81DFc32525eFb3CB257f7e493d', parameters: stored }
  assert.equal(await ensureParameters(p), stored) // pakai raw tersimpan, tak baca hook
  assert.equal(p.parameters, stored)
})

test('ensureParameters: no-hook tanpa parameters → tickSpacing<<16 eksak (tak sentuh jaringan)', async () => {
  const p = { ...pool, hooks: NATIVE, parameters: null }
  const got = await ensureParameters(p)
  assert.equal(got, encodeParameters(pool.tick_spacing)) // eksak utk no-hook
  assert.equal(p.parameters, got) // mutasi in-place
})

test('infinityPoolId: hook-perms bits di parameters mengubah poolId (pool ber-hook ≠ no-hook)', () => {
  const noHook = infinityPoolId(pool)
  const hooked = infinityPoolId({
    ...pool,
    hooks: '0x1111111111111111111111111111111111111111',
    parameters: `0x${((10n << 16n) | 0x0005n).toString(16).padStart(64, '0')}`,
  })
  assert.notEqual(hooked, noHook)
})

test('infinityPoolId: deterministik, 32-byte, beda per parameter pool', () => {
  const id = infinityPoolId(pool)
  assert.match(id, /^0x[0-9a-f]{64}$/)
  assert.equal(infinityPoolId(pool), id) // deterministik
  assert.notEqual(infinityPoolId({ ...pool, tick_spacing: 60 }), id) // parameters beda → id beda
  assert.notEqual(infinityPoolId({ ...pool, fee: 2500 }), id) // fee beda → id beda
})

test('encodeInfinityMint: target CLPositionManager, value=amount0Max (native currency0)', () => {
  const tx = encodeInfinityMint({
    pool,
    tickLower: -100,
    tickUpper: 100,
    liquidity: 1000n,
    amount0Max: 5n,
    amount1Max: 7n,
    owner,
    deadline: 999n,
  })
  assert.equal(tx.to.toLowerCase(), ADDRESSES.clPositionManager.toLowerCase())
  assert.equal(tx.value, 5n) // native → value = amount0Max
  assert.match(tx.data, /^0x[0-9a-f]+$/)
})

test('encodeInfinityBurn: target CLPositionManager, value 0', () => {
  const tx = encodeInfinityBurn({
    tokenId: 42n,
    amount0Min: 0n,
    amount1Min: 0n,
    currency0: NATIVE,
    currency1: pool.currency1 as `0x${string}`,
    recipient: owner,
    deadline: 999n,
  })
  assert.equal(tx.to.toLowerCase(), ADDRESSES.clPositionManager.toLowerCase())
  assert.equal(tx.value, 0n)
})

test('encodeInfinitySwapToNative: target UniversalRouter, value 0 (token1->native)', () => {
  const tx = encodeInfinitySwapToNative({ pool, amountInWei: 100n, minOutWei: 90n, deadline: 999n })
  assert.equal(tx.to.toLowerCase(), ADDRESSES.universalRouter.toLowerCase())
  assert.equal(tx.value, 0n)
})

test('encodeInfinitySwapFromNative: target UniversalRouter, value=amountIn (native->token1)', () => {
  const tx = encodeInfinitySwapFromNative({ pool, amountInWei: 100n, minOutWei: 90n, deadline: 999n })
  assert.equal(tx.to.toLowerCase(), ADDRESSES.universalRouter.toLowerCase())
  assert.equal(tx.value, 100n) // native masuk → value = amountIn
  assert.match(tx.data, /^0x[0-9a-f]+$/)
})
