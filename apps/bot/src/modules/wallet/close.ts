import { privateKeyToAccount } from 'viem/accounts'
import { decryptSecret } from '../../core/crypto.ts'
import { openDb } from '../../core/db.ts'
import { log } from '../../core/util.ts'
import { burnLive, swapToEthLive } from '../executor/live.ts'

type PoolKeyRow = {
  currency0: string
  currency1: string
  fee: number
  tick_spacing: number
  hooks: string
}

/**
 * Tutup posisi LP milik owner (burn + swap token1→ETH balik). Live-only.
 *   close <owner>            → tutup SEMUA posisi OPEN
 *   close <owner> <poolId>   → tutup posisi 1 pool saja
 * Dipakai dapp (spawn) untuk tombol "Close LP" & "withdraw + cabut semua LP".
 */
export async function run(args: string[]) {
  const owner = (args[0] ?? '').toLowerCase()
  const onlyPool = args[1]
  if (!/^0x[0-9a-f]{40}$/.test(owner)) throw new Error('close: owner address tidak valid')
  const secret = process.env.LPBOT_KEY_SECRET
  if (!secret) throw new Error('LPBOT_KEY_SECRET tidak di-set')

  const db = openDb()
  const w = db.prepare('SELECT address, enc_pk FROM wallets WHERE lower(owner) = ?').get(owner) as
    | { address: string; enc_pk: string }
    | undefined
  if (!w) throw new Error('close: tidak ada agent wallet untuk owner ini')
  const account = privateKeyToAccount(decryptSecret(w.enc_pk, secret) as `0x${string}`)
  if (account.address.toLowerCase() !== w.address.toLowerCase())
    throw new Error('close: address decrypt tak cocok')

  const positions = (
    onlyPool
      ? db
          .prepare(
            `SELECT id, pool_id, token_id FROM positions
             WHERE wallet = ? AND pool_id = ? AND status = 'OPEN' AND token_id IS NOT NULL`,
          )
          .all(w.address, onlyPool)
      : db
          .prepare(
            `SELECT id, pool_id, token_id FROM positions
             WHERE wallet = ? AND status = 'OPEN' AND token_id IS NOT NULL`,
          )
          .all(w.address)
  ) as { id: number; pool_id: string; token_id: string }[]

  if (!positions.length) {
    log('close: tak ada posisi OPEN untuk ditutup')
    return
  }

  const record = db.prepare(
    `INSERT INTO executions (ts, wallet, pool_id, kind, amount_eth, tx_hash, status, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )

  for (const p of positions) {
    const now = Math.floor(Date.now() / 1000)
    const pool = db
      .prepare('SELECT currency0, currency1, fee, tick_spacing, hooks FROM pools WHERE pool_id = ?')
      .get(p.pool_id) as PoolKeyRow | undefined
    if (!pool) {
      log(`close: pool ${p.pool_id.slice(0, 10)} tak ditemukan — skip`)
      continue
    }
    try {
      const b = await burnLive({
        account,
        tokenId: BigInt(p.token_id),
        currency0: pool.currency0 as `0x${string}`,
        currency1: pool.currency1 as `0x${string}`,
        deadline: BigInt(now + 600),
      })
      record.run(now, w.address, p.pool_id, 'BURN', null, b.hash,
        b.status === 'success' ? 'CONFIRMED' : 'FAILED', `manual close pos#${p.id} tokenId=${p.token_id}`)
      if (b.status !== 'success') {
        log(`close BURN gagal pos#${p.id}`)
        continue
      }
      db.prepare(`UPDATE positions SET status = 'CLOSED', exit_ts = ? WHERE id = ?`).run(now, p.id)
      log(`close BURN ${b.hash} pos#${p.id}`)
      // token1 kembali → swap balik ke ETH
      const s = await swapToEthLive({ account, pool, deadline: BigInt(now + 600) })
      if (s)
        record.run(now, w.address, p.pool_id, 'SWAP_OUT', Number(s.ethOut) / 1e18, s.hash,
          s.status === 'success' ? 'CONFIRMED' : 'FAILED', 'token1 -> ETH (manual close)')
      log(`close SWAP_OUT ${s?.status ?? 'skip'} ${s?.hash ?? ''}`)
    } catch (e) {
      const msg = String(e)
      if (/NOT_MINTED/i.test(msg)) {
        db.prepare(`UPDATE positions SET status = 'CLOSED', exit_ts = ? WHERE id = ?`).run(now, p.id)
        log(`close pos#${p.id}: NOT_MINTED → tandai CLOSED`)
      } else {
        record.run(now, w.address, p.pool_id, 'BURN', null, null, 'FAILED', msg)
        log(`close gagal pos#${p.id}: ${e}`)
      }
    }
  }
}
