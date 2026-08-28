import { privateKeyToAccount } from 'viem/accounts'
import { client } from '../../core/chain.ts'
import { decryptSecret } from '../../core/crypto.ts'
import { openDb } from '../../core/db.ts'
import { log } from '../../core/util.ts'
import { ACTIVE_CHAIN } from '../../config/index.ts'
import { wcFor } from '../executor/live.ts'

const NATIVE_SYM = ACTIVE_CHAIN.nativeCurrency.symbol
// Sisakan sedikit native untuk gas transfer (transfer ~21k gas).
// ponytail: reserve tetap 0.0002; kalibrasi kalau gasPrice chain naik.
const GAS_RESERVE_WEI = 2n * 10n ** 14n // 0.0002 native

/**
 * Jumlah wei yang boleh dikirim: eksplisit (ETH) atau semua saldo dikurangi reserve gas.
 * null = tak cukup (kosong, atau tak menyisakan gas). Pure — diuji tanpa jaringan.
 */
export function resolveWithdrawWei(
  balWei: bigint,
  reserveWei: bigint,
  requestedEth?: string,
): bigint | null {
  const sendWei = requestedEth ? BigInt(Math.round(Number(requestedEth) * 1e18)) : balWei - reserveWei
  if (sendWei <= 0n || sendWei + reserveWei > balWei) return null
  return sendWei
}

/**
 * Tarik saldo agent wallet ke OWNER (address SIWE terverifikasi). Hanya ke owner,
 * tak bisa ke address lain — kunci keamanan. Posisi LP OPEN tidak ditutup di sini;
 * disable automation dulu agar bot burn, baru withdraw sisa idle.
 * args: [owner]  atau  [owner, amountEth]
 */
export async function run(args: string[]) {
  const owner = (args[0] ?? '').toLowerCase()
  if (!/^0x[0-9a-f]{40}$/.test(owner)) throw new Error('withdraw: owner address tidak valid')
  const secret = process.env.LPBOT_KEY_SECRET
  if (!secret) throw new Error('LPBOT_KEY_SECRET tidak di-set')

  const db = openDb()
  const w = db.prepare('SELECT address, enc_pk FROM wallets WHERE lower(owner) = ?').get(owner) as
    | { address: string; enc_pk: string }
    | undefined
  if (!w) throw new Error('withdraw: tidak ada agent wallet untuk owner ini')

  const account = privateKeyToAccount(decryptSecret(w.enc_pk, secret) as `0x${string}`)
  if (account.address.toLowerCase() !== w.address.toLowerCase())
    throw new Error('withdraw: address hasil decrypt tidak cocok dengan wallet tersimpan')

  const now = Math.floor(Date.now() / 1000)
  const record = db.prepare(
    `INSERT INTO executions (ts, wallet, pool_id, kind, amount_eth, tx_hash, status, detail)
     VALUES (?, ?, '', 'WITHDRAW', ?, ?, ?, ?)`,
  )

  const bal = await client.getBalance({ address: account.address })
  const sendWei = resolveWithdrawWei(bal, GAS_RESERVE_WEI, args[1])
  if (sendWei === null) {
    record.run(now, w.address, null, null, 'FAILED', `saldo tak cukup (bal ${bal} wei)`)
    log('withdraw: saldo idle tak cukup (butuh sisa gas)')
    return
  }

  const wc = wcFor(account) // wallet client chain aktif (BSC/Robinhood) — bukan hardcode Robinhood
  const hash = await wc.sendTransaction({ to: owner as `0x${string}`, value: sendWei })
  record.run(now, w.address, Number(sendWei) / 1e18, hash, 'SENT', `to owner ${owner.slice(0, 10)}`)
  log(`withdraw SENT ${hash} — ${Number(sendWei) / 1e18} ${NATIVE_SYM} -> ${owner}`)
  const receipt = await client.waitForTransactionReceipt({ hash })
  record.run(now, w.address, Number(sendWei) / 1e18, hash,
    receipt.status === 'success' ? 'CONFIRMED' : 'FAILED', `block ${receipt.blockNumber}`)
  log(`withdraw ${receipt.status} ${hash}`)
}
