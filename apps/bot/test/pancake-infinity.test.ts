import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  encodeInfinityBurn,
  encodeInfinityMint,
  encodeInfinitySwapToNative,
  encodeParameters,
} from '../src/modules/dex/pancake-infinity-encode.ts'
import { infinityPoolId } from '../src/modules/dex/pancake-infinity.ts'
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

test('encodeInfinitySwapToNative: target UniversalRouter, value 0', () => {
  const tx = encodeInfinitySwapToNative({ pool, amountInWei: 100n, minOutWei: 90n, deadline: 999n })
  assert.equal(tx.to.toLowerCase(), ADDRESSES.universalRouter.toLowerCase())
  assert.equal(tx.value, 0n)
})
