import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData, parseAbi } from 'viem'
import { encodeVaultSwapFromNative, toInfinityPoolKey } from '../src/modules/dex/vault-adapter.ts'
import { ADDRESSES, NATIVE } from '../src/config/index.ts'

// Sama persis dengan ABI LpVault.swap (contracts/src/LpVault.sol) — round-trip check.
const vaultAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; address hooks; address poolManager; uint24 fee; bytes32 parameters; }',
  'function swap(PoolKey key, bool zeroForOne, uint128 amountIn, uint128 minOut)',
])

const pool = {
  currency0: NATIVE,
  currency1: '0x1111111111111111111111111111111111111111',
  fee: 500,
  tick_spacing: 10,
  hooks: NATIVE,
}
const vault = '0x2222222222222222222222222222222222222222' as const

test('toInfinityPoolKey: 6-field, parameters = tickSpacing<<16, poolManager = CLPoolManager', () => {
  const k = toInfinityPoolKey(pool)
  assert.equal(k.parameters, `0x${(10n << 16n).toString(16).padStart(64, '0')}`)
  assert.equal(k.fee, 500)
  assert.equal(k.poolManager.toLowerCase(), ADDRESSES.clPoolManager.toLowerCase())
})

test('encodeVaultSwapFromNative: to=vault, value=0, decodes to swap(key,true,in,out)', () => {
  const tx = encodeVaultSwapFromNative(vault, pool, 100n, 90n)
  assert.equal(tx.to, vault) // tx dikirim KE vault, bukan router
  assert.equal(tx.value, 0n) // dana di vault; tak ada native dikirim bersama tx
  const { functionName, args } = decodeFunctionData({ abi: vaultAbi, data: tx.data })
  assert.equal(functionName, 'swap')
  assert.equal(args[1], true) // zeroForOne: native -> token1
  assert.equal(args[2], 100n) // amountIn
  assert.equal(args[3], 90n) // minOut
  assert.equal(args[0].poolManager.toLowerCase(), ADDRESSES.clPoolManager.toLowerCase())
})
