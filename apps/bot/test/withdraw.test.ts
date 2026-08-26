import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveWithdrawWei } from '../src/modules/wallet/withdraw.ts'

const RES = 2n * 10n ** 15n // 0.002 ETH gas reserve

test('withdraw: tanpa amount -> semua saldo dikurangi reserve gas', () => {
  assert.equal(resolveWithdrawWei(10n ** 18n, RES, undefined), 10n ** 18n - RES)
})

test('withdraw: amount eksplisit dihormati kalau muat + sisa gas', () => {
  assert.equal(resolveWithdrawWei(10n ** 18n, RES, '0.5'), 5n * 10n ** 17n)
})

test('withdraw: amount yang tak sisakan gas -> null (jangan kirim)', () => {
  assert.equal(resolveWithdrawWei(10n ** 18n, RES, '1'), null) // 1 ETH + gas > 1 ETH
})

test('withdraw: saldo <= reserve -> null (kosong)', () => {
  assert.equal(resolveWithdrawWei(RES, RES, undefined), null)
  assert.equal(resolveWithdrawWei(0n, RES, undefined), null)
})
