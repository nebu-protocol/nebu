import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { privateKeyToAccount } from 'viem/accounts'
import { encryptSecret, decryptSecret } from '../src/core/crypto.ts'
import { openDb } from '../src/core/db.ts'

/**
 * E2E lifecycle wallet: enkripsi (seperti backoffice) -> simpan DB ->
 * baca & dekripsi (seperti executor). Membuktikan enc_pk tidak plaintext
 * dan alamat pulih utuh — kontrak crypto lintas-app.
 */
test('wallet e2e: encrypt -> store -> decrypt, enc_pk tidak pernah plaintext', () => {
  const secret = 'test-e2e-secret-panjang'
  const pk = `0x${randomBytes(32).toString('hex')}` as `0x${string}`
  const addr = privateKeyToAccount(pk).address.toLowerCase()
  const enc = encryptSecret(pk, secret)

  const db = openDb(join(mkdtempSync(join(tmpdir(), 'lpwallet-')), 'e2e.db'))
  db.prepare(
    `INSERT INTO wallets (address, name, enc_pk, fund_eth, max_per_pool_eth, automation, autoswap, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(addr, 'burner', enc, 1, 0.2, 1, 1, 0)

  const w = db.prepare('SELECT * FROM wallets WHERE automation = 1').get() as {
    enc_pk: string
    fund_eth: number
    max_per_pool_eth: number
    autoswap: number
  }
  assert.ok(!w.enc_pk.includes(pk.slice(2)), 'enc_pk mengandung plaintext key!')
  assert.equal(privateKeyToAccount(decryptSecret(w.enc_pk, secret) as `0x${string}`).address.toLowerCase(), addr)
  assert.equal(w.fund_eth, 1)
  assert.equal(w.max_per_pool_eth, 0.2)
  assert.equal(w.autoswap, 1)
})
