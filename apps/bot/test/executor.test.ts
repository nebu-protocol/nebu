import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeFunctionData, parseAbi } from 'viem'
import { encryptSecret, decryptSecret, hashPassword, verifyPassword } from '../src/core/crypto.ts'
import { bankrollMinEth, planEntries } from '../src/modules/executor/executor.ts'
import { encodeV4SwapEthIn } from '../src/modules/executor/live.ts'
import { ADDRESSES, NATIVE } from '../src/config/index.ts'

test('crypto: roundtrip encrypt/decrypt, dan payload dimanipulasi -> gagal', () => {
  const pk = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d'
  const enc = encryptSecret(pk, 'rahasia-kuat')
  assert.notEqual(enc, pk)
  assert.ok(enc.startsWith('v1:'))
  assert.equal(decryptSecret(enc, 'rahasia-kuat'), pk)
  assert.throws(() => decryptSecret(enc, 'secret-salah')) // GCM auth gagal
  const parts = enc.split(':')
  const tampered = `v1:${parts[1]}:${parts[2]}:${Buffer.from('deadbeef').toString('base64')}`
  assert.throws(() => decryptSecret(tampered, 'rahasia-kuat'))
})

test('crypto: dua enkripsi payload sama menghasilkan ciphertext beda (IV acak)', () => {
  const a = encryptSecret('0xabc', 's')
  const b = encryptSecret('0xabc', 's')
  assert.notEqual(a, b)
  assert.equal(decryptSecret(a, 's'), decryptSecret(b, 's'))
})

test('password: hash bukan plaintext, verify benar/salah, salt acak', () => {
  const h = hashPassword('rahasia123')
  assert.ok(h.startsWith('s1:'))
  assert.ok(!h.includes('rahasia123'), 'hash mengandung plaintext!')
  assert.equal(verifyPassword('rahasia123', h), true)
  assert.equal(verifyPassword('salah', h), false)
  assert.notEqual(hashPassword('rahasia123'), h) // salt acak -> hash beda
  assert.equal(verifyPassword('x', 'format-rusak'), false)
})

test('planEntries: cap fund_eth x fraction dan max_per_pool_eth', () => {
  const enters = [
    { poolId: '0xa', sizeFraction: 0.33 },
    { poolId: '0xb', sizeFraction: 0.33 },
  ]
  const plans = planEntries(enters, { fund_eth: 3, max_per_pool_eth: 0.5, autoswap: 1 })
  // 3 * 0.33 = 0.99 -> dibatasi max_per_pool 0.5; separuh untuk swap
  assert.equal(plans.length, 2)
  assert.equal(plans[0]!.totalEth, 0.5)
  assert.equal(plans[0]!.swapEth, 0.25)
})

test('planEntries: minEth floor (rebalance minimal) + sadar-budget', () => {
  const enters = [
    { poolId: '0xa', sizeFraction: 0.33 },
    { poolId: '0xb', sizeFraction: 0.33 },
    { poolId: '0xc', sizeFraction: 0.33 },
  ]
  // fund kecil ($ ~ minEth): frac-size di bawah floor -> dinaikkan ke minEth,
  // tapi budget cuma cukup 1 posisi (0.01), sisanya di-skip.
  const plans = planEntries(enters, { fund_eth: 0.01, max_per_pool_eth: 0, autoswap: 1 }, 0.01)
  assert.equal(plans.length, 1)
  assert.equal(plans[0]!.totalEth, 0.01)
  // max_per_pool 0 = tanpa cap: 3 posisi @0.01 muat di fund 0.05
  assert.equal(planEntries(enters, { fund_eth: 0.05, max_per_pool_eth: 0, autoswap: 1 }, 0.01).length, 3)
  // fund di bawah 1 posisi minimal -> tak ada plan
  assert.equal(planEntries(enters, { fund_eth: 0.005, max_per_pool_eth: 0, autoswap: 1 }, 0.01).length, 0)
})

test('planEntries: autoswap off -> swapEth 0; fund 0 -> tidak ada plan', () => {
  const enters = [{ poolId: '0xa', sizeFraction: 0.5 }]
  assert.equal(planEntries(enters, { fund_eth: 1, max_per_pool_eth: 1, autoswap: 0 })[0]!.swapEth, 0)
  assert.equal(planEntries(enters, { fund_eth: 0, max_per_pool_eth: 1, autoswap: 1 }).length, 0)
})

test('bankrollMinEth: bankroll kecil → posisi ≥ target (sedikit tapi besar)', () => {
  const floor = 0.0005 // ~$1 @ $2000/ETH
  // fund 0.003 ETH = $6, target $3 → desired 2 → 0.0015 ETH/posisi (~$3), bukan $1
  assert.ok(Math.abs(bankrollMinEth(0.003, 2000, floor, 3, 5) - 0.0015) < 1e-9)
})

test('bankrollMinEth: dibatasi jumlah kandidat', () => {
  const floor = 0.0005
  // 1 kandidat saja → seluruh dana ke 1 posisi
  assert.ok(Math.abs(bankrollMinEth(0.003, 2000, floor, 3, 1) - 0.003) < 1e-9)
})

test('bankrollMinEth: bankroll besar dibatasi kandidat (maxPools)', () => {
  const floor = 0.0005
  // $100 fund, target $3 → floor(33) tapi kandidat 8 → 0.05/8 = 0.00625 ETH/posisi
  assert.ok(Math.abs(bankrollMinEth(0.05, 2000, floor, 3, 8) - 0.00625) < 1e-9)
})

test('bankrollMinEth: tanpa harga ETH → floor', () => {
  assert.equal(bankrollMinEth(0.003, 0, 0.0005, 3, 5), 0.0005)
})

test('encodeV4SwapEthIn: calldata valid untuk Universal Router execute', () => {
  const pool = {
    currency0: NATIVE,
    currency1: '0x1111111111111111111111111111111111111111',
    fee: 3000,
    tick_spacing: 60,
    hooks: NATIVE,
  }
  const tx = encodeV4SwapEthIn(pool, 10n ** 17n, 42n, 1_800_000_000n)
  assert.equal(tx.to, ADDRESSES.universalRouter)
  assert.equal(tx.value, 10n ** 17n) // ETH native ikut sebagai msg.value
  const decoded = decodeFunctionData({
    abi: parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable']),
    data: tx.data,
  })
  assert.equal(decoded.functionName, 'execute')
  assert.equal(decoded.args[0], '0x10') // V4_SWAP
  assert.equal((decoded.args[1] as string[]).length, 1)
  assert.equal(decoded.args[2], 1_800_000_000n)
  // deterministik: input sama -> calldata sama
  assert.deepEqual(tx, encodeV4SwapEthIn(pool, 10n ** 17n, 42n, 1_800_000_000n))
})
