/**
 * Smoke test live terhadap RPC Robinhood Chain (butuh jaringan — TIDAK ikut `npm test`).
 * Jalankan: npm run test:live
 * Gagal = chain ID berubah, RPC mati, atau alamat kontrak tidak lagi berisi kode.
 */
import assert from 'node:assert/strict'
import { client } from '../src/core/chain.ts'
import { ADDRESSES } from '../src/config/index.ts'

const chainId = await client.getChainId()
assert.equal(chainId, 4663, `chain ID ${chainId} != 4663`)

for (const [name, address] of Object.entries(ADDRESSES)) {
  const code = await client.getCode({ address: address as `0x${string}` })
  assert.ok(code && code !== '0x', `${name} @ ${address}: tidak ada kode`)
}

console.log('live smoke OK: chain 4663, semua kontrak berisi kode')
