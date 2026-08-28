import { getAddress, parseAbi } from 'viem'
import { ADDRESSES, CHAIN } from '../../config/index.ts'
import { client } from '../../core/chain.ts'
import { openDb } from '../../core/db.ts'
import { log } from '../../core/util.ts'

// API explorer (format Etherscan-compatible: ?module=account&action=txlist) per chain.
// BscScan butuh apikey (env EXPLORER_API_KEY / BSCSCAN_API_KEY); Blockscout tidak.
const EXPLORER_API: Record<string, string> = {
  bsc: 'https://api.bscscan.com/api',
  'bsc-testnet': 'https://api-testnet.bscscan.com/api',
  robinhood: 'https://robinhoodchain.blockscout.com/api',
}
const API_BASE = EXPLORER_API[CHAIN] ?? EXPLORER_API.robinhood!
const API_KEY = process.env.EXPLORER_API_KEY ?? process.env.BSCSCAN_API_KEY ?? ''

// Kontrak bot: native balik dari swap/burn lewat kontrak2 ini (biasanya INTERNAL tx, tak
// masuk txlist normal) — kalau muncul sbg pengirim tx normal, JANGAN hitung deposit. Chain-aware:
// semua alamat kontrak non-ZERO dari profil aktif (v4 di Robinhood, Infinity+vault di BSC).
const ZERO = '0x0000000000000000000000000000000000000000'
const BOT_CONTRACTS = new Set(
  Object.values(ADDRESSES)
    .map((a) => a.toLowerCase())
    .filter((a) => a !== ZERO),
)

type Tx = { from?: string; to?: string; value?: string }

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
])

/**
 * Nilai (ETH) token ERC20 LEPAS yg dipegang agent — sisa/stuck dari mint parsial, BUKAN
 * yg terkunci di LP (itu diwakili NFT posisi & dihitung terpisah). GMGN menghitung ini
 * sbg holding; PnL-saldo kita harus juga, biar cocok. Harga token = snapshot pool terbaru
 * (ETH selalu currency0, token currency1 → sqrtP² = token/ETH → ETH = balance / (token/ETH)).
 *
 * Dibaca ON-CHAIN (balanceOf) bukan Blockscout tokenlist — explorer di chain ini flaky
 * (kadang "No tokens found" utk saldo nyata). Kandidat token = currency1 tiap pool yg
 * pernah disentuh wallet (dari executions) — bounded & cukup (stuck token asalnya dari sini).
 */
async function tokenHoldingsEth(db: ReturnType<typeof openDb>, agent: string): Promise<number> {
  const toks = db
    .prepare(
      `SELECT DISTINCT lower(p.currency1) c FROM pools p
       WHERE p.pool_id IN (SELECT DISTINCT pool_id FROM executions WHERE lower(wallet) = ?)
         AND p.currency1 != '0x0000000000000000000000000000000000000000'`,
    )
    .all(agent.toLowerCase()) as { c: string }[]
  const priceStmt = db.prepare(
    `SELECT ps.sqrt_price_x96 sp FROM pool_snapshots ps
     JOIN pools p ON p.pool_id = ps.pool_id
     WHERE lower(p.currency1) = ? ORDER BY ps.ts DESC LIMIT 1`,
  )
  let total = 0
  for (const { c } of toks) {
    try {
      const bal = (await client.readContract({
        address: getAddress(c),
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [agent as `0x${string}`],
      })) as bigint
      if (bal === 0n) continue
      const snap = priceStmt.get(c) as { sp: string } | undefined
      if (!snap) continue // tak ada pool → tak bisa dinilai; konservatif (0), tak salah-tinggi
      const dec = (await client.readContract({
        address: getAddress(c),
        abi: erc20Abi,
        functionName: 'decimals',
      })) as number
      const human = Number(bal) / 10 ** Number(dec)
      const sqrtP = Number(BigInt(snap.sp)) / 2 ** 96
      const price = sqrtP * sqrtP // token1/token0 = token per ETH
      if (price > 0) total += human / price
    } catch {
      // token aneh / RPC gagal — lewati (konservatif), jangan gagalkan seluruh ledger
    }
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
      const url = `${API_BASE}?module=account&action=txlist&address=${w.address}&sort=asc&page=1&offset=1000${API_KEY ? `&apikey=${API_KEY}` : ''}`
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
