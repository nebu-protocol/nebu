import { ADDRESSES } from '../../config/index.ts'
import { openDb } from '../../core/db.ts'
import { log } from '../../core/util.ts'

const EXPLORER = 'https://robinhoodchain.blockscout.com'

// Kontrak bot: ETH balik dari swap/burn lewat kontrak2 ini (biasanya INTERNAL tx,
// tak masuk txlist normal) — kalau muncul sbg pengirim tx normal, JANGAN hitung deposit.
const BOT_CONTRACTS = new Set(
  [
    ADDRESSES.universalRouter,
    ADDRESSES.positionManager,
    ADDRESSES.poolManager,
    ADDRESSES.permit2,
    ADDRESSES.quoter,
    ADDRESSES.stateView,
  ].map((a) => a.toLowerCase()),
)

type Tx = { from?: string; to?: string; value?: string }
type TokenBal = { contractAddress?: string; balance?: string; decimals?: string; type?: string }

/**
 * Nilai (ETH) token ERC20 LEPAS yg dipegang agent — sisa/stuck dari mint parsial, BUKAN
 * yg terkunci di LP (itu diwakili NFT posisi & dihitung terpisah). GMGN menghitung ini
 * sbg holding; PnL-saldo kita harus juga, biar cocok. Harga token = snapshot pool terbaru
 * (ETH selalu currency0, token currency1 → sqrtP² = token/ETH → ETH = balance / (token/ETH)).
 */
async function tokenHoldingsEth(db: ReturnType<typeof openDb>, agent: string): Promise<number> {
  const url = `${EXPLORER}/api?module=account&action=tokenlist&address=${agent}`
  const r = await fetch(url)
  const j = (await r.json()) as { result?: TokenBal[] | string }
  if (!Array.isArray(j.result)) return 0
  const priceStmt = db.prepare(
    `SELECT ps.sqrt_price_x96 sp FROM pool_snapshots ps
     JOIN pools p ON p.pool_id = ps.pool_id
     WHERE lower(p.currency1) = ? ORDER BY ps.ts DESC LIMIT 1`,
  )
  let total = 0
  for (const t of j.result) {
    if (t.type && t.type !== 'ERC-20') continue // NFT posisi (UNI-V4-POSM) dll — abaikan
    const dec = Number(t.decimals || '18')
    const bal = Number(t.balance || '0') / 10 ** dec
    if (!(bal > 0)) continue
    const snap = priceStmt.get((t.contractAddress || '').toLowerCase()) as { sp: string } | undefined
    if (!snap) continue // tak ada pool → tak bisa dinilai; konservatif (0), tak salah-tinggi
    const sqrtP = Number(BigInt(snap.sp)) / 2 ** 96
    const price = sqrtP * sqrtP // token1/token0 = token per ETH
    if (price > 0) total += bal / price
  }
  return total
}

/**
 * Rekonsiliasi deposit/withdraw ON-CHAIN per agent wallet dari block explorer:
 * jumlah ETH masuk dari owner (deposit) & keluar ke owner (withdraw). Dipakai utk
 * PnL berbasis SALDO (saldo + nilai posisi − net deposit) yang akurat — tak bergantung
 * akuntansi per-posisi (yg bisa over-count gas/slippage). Jalan di siklus penuh.
 */
export async function run() {
  const db = openDb()
  const wallets = db
    .prepare("SELECT address, owner FROM wallets WHERE owner LIKE '0x%'")
    .all() as { address: string; owner: string }[]
  for (const w of wallets) {
    try {
      const url = `${EXPLORER}/api?module=account&action=txlist&address=${w.address}&sort=asc&page=1&offset=1000`
      const r = await fetch(url)
      const j = (await r.json()) as { result?: Tx[] | string }
      if (!Array.isArray(j.result)) {
        log(`ledger-sync ${w.address.slice(0, 10)}: explorer belum siap (${String(j.result).slice(0, 40)})`)
        continue
      }
      const A = w.address.toLowerCase()
      const O = w.owner.toLowerCase()
      let dep = 0
      let wd = 0
      for (const t of j.result) {
        const f = (t.from || '').toLowerCase()
        const to = (t.to || '').toLowerCase()
        const v = Number(t.value || '0') / 1e18
        if (v <= 0) continue
        // Masuk dari EOA mana pun (bukan kontrak bot) = DEPOSIT (user bisa setor dari
        // >1 wallet; ETH balik bot = internal tx, tak di sini). Keluar ke owner = withdraw.
        if (to === A && f !== A && !BOT_CONTRACTS.has(f)) dep += v
        else if (f === A && to === O) wd += v
      }
      const holdings = await tokenHoldingsEth(db, w.address).catch(() => 0)
      db.prepare(
        'UPDATE wallets SET deposited_eth = ?, withdrawn_eth = ?, token_holdings_eth = ? WHERE lower(address) = ?',
      ).run(dep, wd, holdings, A)
      log(
        `ledger ${w.address.slice(0, 10)}: deposited ${dep.toFixed(6)} withdrawn ${wd.toFixed(6)} holdings ${holdings.toFixed(6)} ETH`,
      )
    } catch (e) {
      log(`ledger-sync skip ${w.address.slice(0, 10)}: ${e}`)
    }
  }
}
