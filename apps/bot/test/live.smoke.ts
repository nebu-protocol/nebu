/**
 * Smoke test live terhadap RPC chain AKTIF (butuh jaringan — TIDAK ikut `npm test`).
 * Jalankan: npm run test:live   (pilih chain via env CHAIN, default 'bsc').
 * Gagal = chain ID berubah, RPC mati, atau alamat kontrak tidak lagi berisi kode.
 */
import assert from 'node:assert/strict'
import { client } from '../src/core/chain.ts'
import { ADDRESSES, ACTIVE_CHAIN, ZERO } from '../src/config/index.ts'

const chainId = await client.getChainId()
assert.equal(chainId, ACTIVE_CHAIN.id, `chain ID ${chainId} != ${ACTIVE_CHAIN.id}`)

for (const [name, address] of Object.entries(ADDRESSES)) {
  if (address === ZERO) continue // slot DEX-lain (mis. Infinity-only di Robinhood) — sengaja kosong
  const code = await client.getCode({ address: address as `0x${string}` })
  assert.ok(code && code !== '0x', `${name} @ ${address}: tidak ada kode`)
}

console.log(`live smoke OK: chain ${chainId} (${ACTIVE_CHAIN.name}), semua kontrak berisi kode`)
