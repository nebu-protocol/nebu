import { createWalletClient, encodeAbiParameters, encodeFunctionData, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { client } from '../../core/chain.ts'
import { decryptSecret } from '../../core/crypto.ts'
import { openDb } from '../../core/db.ts'
import { log } from '../../core/util.ts'
import { ADDRESSES, MIN_POSITION_USD, NATIVE, REENTRY_COOLDOWN_S, robinhoodChain, RPC_URL } from '../../config/index.ts'
import { encodeMintPosition } from './mint.ts'
import { encodeBurnPosition } from './burn.ts'
import { burnLive, mintLive, swapToEthLive } from './live.ts'
import {
  liquidityForAmounts,
  rangeFromWidth,
  sqrtRatioX96AtTick,
} from './liquidity-math.ts'

/**
 * Executor v1 — auto-swap sisi ENTER (ETH -> token1) via Universal Router v4.
 * Default SIMULASI (eth_call + state override, tercatat di tabel executions).
 * Transaksi live HANYA jika wallet.automation=1 DAN env EXECUTOR_LIVE=1.
 * Mint posisi LP = fase berikutnya.
 */

export type EntryDecision = { poolId: string; sizeFraction: number; widthFactor?: number }
export type WalletFunds = { fund_eth: number; max_per_pool_eth: number; autoswap: number }
export type EntryPlan = { poolId: string; totalEth: number; swapEth: number; widthFactor: number }

/**
 * Sizing murni: cap fund per pool, floor minimal per posisi (minEth), sadar-budget
 * (total tak melebihi fund). max_per_pool_eth <= 0 = tanpa cap. Separuh untuk di-swap.
 * minEth: posisi di bawah ini dinaikkan ke minEth (rebalance minimal, mis. $1); kalau
 * fund tak cukup untuk 1 posisi minimal, tak ada plan.
 */
export function planEntries(enters: EntryDecision[], w: WalletFunds, minEth = 0): EntryPlan[] {
  const cap = w.max_per_pool_eth > 0 ? w.max_per_pool_eth : Infinity
  const plans: EntryPlan[] = []
  let spent = 0
  for (const e of enters) {
    let totalEth = Math.min(w.fund_eth * e.sizeFraction, cap)
    if (totalEth < minEth) totalEth = minEth // floor: rebalance minimal
    if (totalEth <= 0) continue
    if (spent + totalEth > w.fund_eth + 1e-12) continue // jangan lewati fund tersedia
    spent += totalEth
    plans.push({
      poolId: e.poolId,
      totalEth,
      swapEth: w.autoswap ? totalEth / 2 : 0,
      widthFactor: e.widthFactor ?? 1.2,
    })
  }
  return plans
}

type PoolKeyRow = {
  currency0: string
  currency1: string
  fee: number
  tick_spacing: number
  hooks: string
}

const urAbi = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
])

const quoterAbi = parseAbi([
  'function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
])

const COMMAND_V4_SWAP = '0x10'
const ACTIONS = '0x060c0f' // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL

/** Calldata Universal Router: swap exact-in ETH (currency0) -> token1. */
export function encodeV4SwapEthIn(
  pool: PoolKeyRow,
  amountInWei: bigint,
  minOutWei: bigint,
  deadline: bigint,
): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
  const poolKey = {
    currency0: pool.currency0 as `0x${string}`,
    currency1: pool.currency1 as `0x${string}`,
    fee: pool.fee,
    tickSpacing: pool.tick_spacing,
    hooks: pool.hooks as `0x${string}`,
  }
  const swapParam = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          {
            name: 'poolKey',
            type: 'tuple',
            components: [
              { name: 'currency0', type: 'address' },
              { name: 'currency1', type: 'address' },
              { name: 'fee', type: 'uint24' },
              { name: 'tickSpacing', type: 'int24' },
              { name: 'hooks', type: 'address' },
            ],
          },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [
      {
        poolKey,
        zeroForOne: true,
        amountIn: amountInWei,
        amountOutMinimum: minOutWei,
        hookData: '0x',
      },
    ],
  )
  const settle = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [poolKey.currency0, amountInWei],
  )
  const take = encodeAbiParameters(
    [{ type: 'address' }, { type: 'uint256' }],
    [poolKey.currency1, minOutWei],
  )
  const input0 = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [ACTIONS, [swapParam, settle, take]],
  )
  const data = encodeFunctionData({
    abi: urAbi,
    functionName: 'execute',
    args: [COMMAND_V4_SWAP, [input0], deadline],
  })
  return { to: ADDRESSES.universalRouter, data, value: amountInWei }
}

const SLIPPAGE_BPS = 100n // 1%

/**
 * Hitung range + liquidity dari sisa ETH (amount0) & token hasil swap (amount1),
 * encode mint PositionManager, dan catat sebagai MINT SIMULATED. Butuh snapshot
 * tick pool. Tidak menyentuh jaringan — murni kalkulasi + encode.
 */
function simulateMint(
  db: ReturnType<typeof openDb>,
  record: ReturnType<ReturnType<typeof openDb>['prepare']>,
  latestSnap: ReturnType<ReturnType<typeof openDb>['prepare']>,
  wallet: string,
  plan: EntryPlan,
  pool: PoolKeyRow,
  amount1: bigint,
  now: number,
) {
  const snap = latestSnap.get(plan.poolId) as { sqrt_price_x96: string; tick: number } | undefined
  if (!snap) {
    record.run(now, wallet, plan.poolId, 'MINT', null, null, 'FAILED', 'tidak ada snapshot tick')
    return
  }
  const amount0 = BigInt(Math.round((plan.totalEth - plan.swapEth) * 1e18))
  const widthFactor = plan.widthFactor
  const { tickLower, tickUpper } = rangeFromWidth(snap.tick, pool.tick_spacing, widthFactor)
  const sqrtP = BigInt(snap.sqrt_price_x96)
  const sqrtA = sqrtRatioX96AtTick(tickLower)
  const sqrtB = sqrtRatioX96AtTick(tickUpper)
  const liquidity = liquidityForAmounts(sqrtP, sqrtA, sqrtB, amount0, amount1)
  if (liquidity <= 0n) {
    record.run(now, wallet, plan.poolId, 'MINT', null, null, 'FAILED', 'liquidity 0 (amount/range)')
    return
  }
  const mint = encodeMintPosition({
    pool,
    tickLower,
    tickUpper,
    liquidity,
    amount0Max: amount0,
    amount1Max: amount1,
    owner: wallet as `0x${string}`,
    deadline: BigInt(now + 600),
  })
  record.run(now, wallet, plan.poolId, 'MINT', plan.totalEth - plan.swapEth, null, 'SIMULATED',
    `ticks [${tickLower},${tickUpper}] L=${liquidity} to=${mint.to.slice(0, 10)}`)
  // catat posisi OPEN — jadi acuan EXIT/burn nanti
  db.prepare(
    `INSERT INTO positions (wallet, pool_id, token_id, tick_lower, tick_upper, liquidity, entry_ts, status)
     VALUES (?, ?, NULL, ?, ?, ?, ?, 'OPEN')`,
  ).run(wallet, plan.poolId, tickLower, tickUpper, liquidity.toString(), now)
}

/**
 * Tutup posisi OPEN untuk pool yang strategist putuskan EXIT. Encode burn,
 * catat sebagai EXIT, tandai posisi CLOSED. Simulasi: tokenId 0 (belum ada NFT).
 */
function simulateExit(
  db: ReturnType<typeof openDb>,
  record: ReturnType<ReturnType<typeof openDb>['prepare']>,
  wallet: string,
  poolId: string,
  pool: PoolKeyRow,
  now: number,
) {
  const open = db
    .prepare(`SELECT id, token_id FROM positions WHERE wallet = ? AND pool_id = ? AND status = 'OPEN'`)
    .all(wallet, poolId) as { id: number; token_id: string | null }[]
  for (const p of open) {
    const burn = encodeBurnPosition({
      tokenId: p.token_id ? BigInt(p.token_id) : 0n,
      amount0Min: 0n,
      amount1Min: 0n,
      currency0: pool.currency0 as `0x${string}`,
      currency1: pool.currency1 as `0x${string}`,
      recipient: wallet as `0x${string}`,
      deadline: BigInt(now + 600),
    })
    record.run(now, wallet, poolId, 'BURN', null, null, 'SIMULATED',
      `close pos#${p.id} tokenId=${p.token_id ?? 'sim'} to=${burn.to.slice(0, 10)}`)
    db.prepare(`UPDATE positions SET status = 'CLOSED', exit_ts = ? WHERE id = ?`).run(now, p.id)
  }
}

export async function run() {
  const db = openDb()
  const live = process.env.EXECUTOR_LIVE === '1'
  const secret = process.env.LPBOT_KEY_SECRET

  // Rebalance minimal $1 (config) → ETH pakai harga terkini; 0 kalau harga belum ada.
  const ethUsdRow = db.prepare("SELECT value FROM meta WHERE key = 'eth_usd'").get() as
    | { value: string }
    | undefined
  const ethUsd = ethUsdRow ? Number(ethUsdRow.value) : 0
  const minEth = ethUsd > 0 ? MIN_POSITION_USD / ethUsd : 0

  type WalletRow = {
    address: string
    name: string
    enc_pk: string
  } & WalletFunds
  const wallets = db
    .prepare('SELECT address, name, enc_pk, fund_eth, max_per_pool_eth, autoswap FROM wallets WHERE automation = 1')
    .all() as WalletRow[]
  if (wallets.length === 0) {
    log('executor: tidak ada wallet dengan automation aktif — selesai')
    return
  }

  const latestDecisionRows = db
    .prepare(
      `SELECT dc.pool_id, dc.action, dc.size_fraction, dc.width_factor,
              p.currency0, p.currency1, p.fee, p.tick_spacing, p.hooks
       FROM decisions dc JOIN pools p ON p.pool_id = dc.pool_id
       WHERE dc.ts = (SELECT MAX(ts) FROM decisions)`,
    )
    .all() as ({ pool_id: string; action: string; size_fraction: number; width_factor: number } & PoolKeyRow)[]
  const enters = latestDecisionRows.filter((d) => d.action === 'ENTER')
  const exits = latestDecisionRows.filter((d) => d.action === 'EXIT')

  const latestSnap = db.prepare(
    `SELECT sqrt_price_x96, tick FROM pool_snapshots WHERE pool_id = ?
     ORDER BY ts DESC LIMIT 1`,
  )

  const record = db.prepare(
    `INSERT INTO executions (ts, wallet, pool_id, kind, amount_eth, tx_hash, status, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  // Varian dgn leg token1 (untuk aktivitas swap/mint). amount_token1 = human-readable.
  const recordTok = db.prepare(
    `INSERT INTO executions (ts, wallet, pool_id, kind, amount_eth, tx_hash, status, detail, amount_token1)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const decStmt = db.prepare('SELECT decimals FROM tokens WHERE lower(address) = ?')
  const toTok = (raw: bigint, currency1: string) => {
    const d = (decStmt.get(currency1.toLowerCase()) as { decimals: number } | undefined)?.decimals ?? 18
    return Number(raw) / 10 ** d
  }
  // Dedup SIM: swap tercatat (termasuk SIMULATED) → jangan ulang di mode sim.
  const alreadyDone = db.prepare(
    `SELECT 1 FROM executions WHERE wallet = ? AND pool_id = ? AND kind = 'SWAP_IN' AND status != 'FAILED' LIMIT 1`,
  )
  // Resume-mint HANYA utk swap NYATA yg token1-nya masih nyangkut = ada SWAP_IN
  // (SENT/CONFIRMED) TAPI belum ada posisi sama sekali utk pool ini. Kalau posisi sudah
  // ada (mis. sudah pernah entry+exit), swap lama sudah dikonsumsi → JANGAN resume
  // (token1 sudah di-swap balik = 0) → biar jalur fresh yg swap ulang saat re-entry.
  const liveSwapDone = db.prepare(
    `SELECT 1 FROM executions e WHERE e.wallet = ? AND e.pool_id = ? AND e.kind = 'SWAP_IN'
       AND e.status IN ('SENT','CONFIRMED')
       AND NOT EXISTS (SELECT 1 FROM positions p WHERE p.wallet = e.wallet AND p.pool_id = e.pool_id)
     LIMIT 1`,
  )

  for (const w of wallets) {
    // Decrypt key sekali per wallet kalau live; verifikasi address cocok.
    let account: ReturnType<typeof privateKeyToAccount> | null = null
    if (live) {
      if (!secret) {
        log(`EXECUTOR_LIVE tapi LPBOT_KEY_SECRET kosong — skip ${w.name}`)
        continue
      }
      account = privateKeyToAccount(decryptSecret(w.enc_pk, secret) as `0x${string}`)
      if (account.address.toLowerCase() !== w.address.toLowerCase()) {
        log(`key mismatch untuk ${w.name} — skip`)
        continue
      }
    }

    // Reconcile: token1 dari swap NYATA yang belum jadi posisi (mint gagal / proses
    // mati di tengah) → mint sekarang. Bikin swap→mint tahan-banting.
    if (live && account && minEth > 0) {
      const stranded = db
        .prepare(
          `SELECT DISTINCT e.pool_id, p.currency0, p.currency1, p.fee, p.tick_spacing, p.hooks
           FROM executions e JOIN pools p ON p.pool_id = e.pool_id
           WHERE e.wallet = ? AND e.kind = 'SWAP_IN' AND e.status IN ('SENT','CONFIRMED')
             AND NOT EXISTS (
               SELECT 1 FROM positions po WHERE po.wallet = e.wallet AND po.pool_id = e.pool_id
                 AND po.token_id IS NOT NULL)`,
        )
        .all(w.address) as (PoolKeyRow & { pool_id: string })[]
      for (const s of stranded) {
        const now = Math.floor(Date.now() / 1000)
        const amount0 = BigInt(Math.round(minEth * 1e18))
        try {
          const m = await mintLive({
            account,
            poolId: s.pool_id,
            pool: s,
            amount0Wei: amount0,
            widthFactor: 1.2,
            deadline: BigInt(now + 600),
          })
          recordTok.run(now, w.address, s.pool_id, 'MINT', Number(amount0) / 1e18, m.hash,
            m.status === 'success' ? 'CONFIRMED' : 'FAILED',
            `reconcile ticks [${m.tickLower},${m.tickUpper}] tokenId=${m.tokenId ?? '?'}`,
            toTok(m.amount1, s.currency1))
          if (m.status === 'success')
            db.prepare(
              `INSERT INTO positions (wallet, pool_id, token_id, tick_lower, tick_upper, liquidity, entry_ts, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
            ).run(w.address, s.pool_id, m.tokenId ? m.tokenId.toString() : null,
              m.tickLower, m.tickUpper, m.liquidity.toString(), now)
          log(`RECONCILE MINT ${m.status} ${m.hash} tokenId=${m.tokenId}`)
        } catch (e) {
          log(`reconcile skip ${s.pool_id.slice(0, 10)}: ${e}`)
        }
      }
    }

    // EXIT dulu: tutup posisi OPEN yang strategist tandai keluar.
    for (const ex of exits) {
      const now = Math.floor(Date.now() / 1000)
      if (live && account) {
        const open = db
          .prepare(`SELECT id, token_id FROM positions WHERE wallet = ? AND pool_id = ? AND status = 'OPEN'`)
          .all(w.address, ex.pool_id) as { id: number; token_id: string | null }[]
        let burnedAny = false
        for (const p of open) {
          if (!p.token_id) {
            record.run(now, w.address, ex.pool_id, 'BURN', null, null, 'FAILED', `pos#${p.id} tanpa tokenId (sim)`)
            continue
          }
          try {
            const b = await burnLive({
              account,
              tokenId: BigInt(p.token_id),
              currency0: ex.currency0 as `0x${string}`,
              currency1: ex.currency1 as `0x${string}`,
              deadline: BigInt(now + 600),
            })
            record.run(now, w.address, ex.pool_id, 'BURN', null, b.hash,
              b.status === 'success' ? 'CONFIRMED' : 'FAILED', `close pos#${p.id} tokenId=${p.token_id}`)
            if (b.status === 'success') {
              db.prepare(`UPDATE positions SET status = 'CLOSED', exit_ts = ? WHERE id = ?`).run(now, p.id)
              burnedAny = true
            }
            log(`BURN ${b.status} ${b.hash}`)
          } catch (e) {
            // Token sudah tak ada (di-burn proses lain / race) → sinkronkan CLOSED, BUKAN FAILED.
            if (/NOT_MINTED/i.test(String(e))) {
              db.prepare(`UPDATE positions SET status = 'CLOSED', exit_ts = ? WHERE id = ?`).run(now, p.id)
              log(`BURN skip pos#${p.id}: NOT_MINTED (sinkron CLOSED)`)
            } else {
              // Gagal preflight burn (belum kirim) → skip; jangan catat FAILED.
              log(`BURN skip pos#${p.id}: ${e}`)
            }
          }
        }
        // Setelah burn: token1 kembali ke agent → swap balik ke ETH biar bisa di-withdraw.
        if (burnedAny) {
          try {
            const s = await swapToEthLive({ account, pool: ex, deadline: BigInt(now + 600) })
            if (s)
              recordTok.run(now, w.address, ex.pool_id, 'SWAP_OUT', Number(s.ethOut) / 1e18, s.hash,
                s.status === 'success' ? 'CONFIRMED' : 'FAILED', 'token1 -> ETH (exit)',
                toTok(s.amountIn, ex.currency1))
            log(`SWAP_OUT ${s?.status ?? 'skip'} ${s?.hash ?? ''}`)
          } catch (e) {
            // Preflight swap-back gagal (belum kirim) → skip; jangan catat FAILED.
            log(`SWAP_OUT skip ${ex.pool_id.slice(0, 10)}: ${e}`)
          }
        }
        continue
      }
      simulateExit(db, record, w.address, ex.pool_id, ex, now)
    }

    // Cap fund efektif ke saldo NYATA wallet (dari private key user) — tak pernah
    // mencoba deploy lebih dari yang benar-benar dimiliki. Berlaku dapp & backoffice.
    let effFund = w.fund_eth
    try {
      const balWei = await client.getBalance({ address: w.address as `0x${string}` })
      const balEth = Number(balWei) / 1e18
      effFund = Math.min(w.fund_eth, balEth)
    } catch {
      // RPC gagal — pakai fund tersimpan (jangan blokir siklus)
    }

    const plans = planEntries(
      enters.map((e) => ({
        poolId: e.pool_id,
        sizeFraction: e.size_fraction,
        widthFactor: e.width_factor,
      })),
      { ...w, fund_eth: effFund },
      minEth,
    )
    for (const plan of plans) {
      const now = Math.floor(Date.now() / 1000)
      if (plan.swapEth <= 0) continue
      const pool = enters.find((e) => e.pool_id === plan.poolId)!
      if (pool.currency0 !== NATIVE) continue // v1 hanya pasangan ETH

      // OPEN → jangan double-enter (blok permanen).
      const openPos = db
        .prepare("SELECT 1 FROM positions WHERE wallet=? AND pool_id=? AND status='OPEN' AND token_id IS NOT NULL LIMIT 1")
        .get(w.address, plan.poolId)
      if (openPos) continue
      // CLOSED → cooldown re-entry: jangan langsung balik ke pool yg baru di-exit
      // (whipsaw), TAPI setelah cooldown boleh masuk lagi (kondisi bisa beda). Blok
      // permanen dulu = bot kehabisan pool → berhenti entry.
      const lastExit = db
        .prepare("SELECT MAX(exit_ts) t FROM positions WHERE wallet=? AND pool_id=? AND status='CLOSED'")
        .get(w.address, plan.poolId) as { t: number | null }
      if (lastExit?.t && now - lastExit.t < REENTRY_COOLDOWN_S) {
        log(`skip ${plan.poolId.slice(0, 10)}: cooldown re-entry (${Math.round((now - lastExit.t) / 60)}m < ${REENTRY_COOLDOWN_S / 60}m)`)
        continue
      }

      const amount0 = BigInt(Math.round((plan.totalEth - plan.swapEth) * 1e18))

      // Mint on-chain + catat + simpan posisi — dipakai jalur fresh & resume.
      const finalizeMint = async () => {
        if (!account) return
        try {
          const m = await mintLive({
            account,
            poolId: plan.poolId,
            pool,
            amount0Wei: amount0,
            widthFactor: plan.widthFactor,
            deadline: BigInt(now + 600),
          })
          recordTok.run(now, w.address, plan.poolId, 'MINT', plan.totalEth - plan.swapEth, m.hash,
            m.status === 'success' ? 'CONFIRMED' : 'FAILED',
            `ticks [${m.tickLower},${m.tickUpper}] tokenId=${m.tokenId ?? '?'} L=${m.liquidity}`,
            toTok(m.amount1, pool.currency1))
          if (m.status === 'success')
            db.prepare(
              `INSERT INTO positions (wallet, pool_id, token_id, tick_lower, tick_upper, liquidity, entry_ts, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
            ).run(w.address, plan.poolId, m.tokenId ? m.tokenId.toString() : null,
              m.tickLower, m.tickUpper, m.liquidity.toString(), now)
          log(`MINT ${m.status} ${m.hash} tokenId=${m.tokenId}`)
        } catch (e) {
          // Gagal di PREFLIGHT / setup (belum kirim tx) → SKIP bersih, bukan FAILED.
          // Reconcile siklus berikut yg tangani token1 nyangkut (kalau ada).
          log(`mint skip ${plan.poolId.slice(0, 10)}: ${e}`)
        }
      }

      // Live: swap NYATA sudah sukses tapi belum ada posisi → mint token1 nyangkut (resume).
      if (live && account) {
        if (liveSwapDone.get(w.address, plan.poolId)) {
          await finalizeMint()
          continue
        }
      } else if (alreadyDone.get(w.address, plan.poolId)) {
        continue // non-live sudah dieksekusi
      }

      const amountIn = BigInt(Math.round(plan.swapEth * 1e18))
      // Quote dulu (di luar try utama): kalau revert = pool tak bisa di-price
      // (likuiditas tipis) → SKIP bersih, bukan FAILED yg mengotori aktivitas.
      let quoted: bigint
      try {
        ;[quoted] = (await client.readContract({
          address: ADDRESSES.quoter,
          abi: quoterAbi,
          functionName: 'quoteExactInputSingle',
          args: [
            {
              poolKey: {
                currency0: pool.currency0 as `0x${string}`,
                currency1: pool.currency1 as `0x${string}`,
                fee: pool.fee,
                tickSpacing: pool.tick_spacing,
                hooks: pool.hooks as `0x${string}`,
              },
              zeroForOne: true,
              exactAmount: amountIn,
              hookData: '0x',
            },
          ],
        })) as readonly [bigint, bigint]
      } catch {
        log(`skip ${plan.poolId.slice(0, 10)}: quote revert (likuiditas tipis / tak bisa di-price)`)
        continue
      }
      try {
        const minOut = (quoted * (10_000n - SLIPPAGE_BPS)) / 10_000n
        const tx = encodeV4SwapEthIn(pool, amountIn, minOut, BigInt(now + 600))

        // Preflight (validasi calldata, saldo sintetis). Gagal = SKIP bersih (belum
        // kirim tx apa pun) — BUKAN FAILED. Cegah tx buruk sebelum menghabiskan gas.
        try {
          await client.call({
            account: w.address as `0x${string}`,
            to: tx.to,
            data: tx.data,
            value: tx.value,
            stateOverride: [{ address: w.address as `0x${string}`, balance: tx.value + 10n ** 17n }],
          })
        } catch {
          log(`skip ${plan.poolId.slice(0, 10)}: preflight swap gagal (likuiditas/calldata)`)
          continue
        }

        if (!live) {
          record.run(now, w.address, plan.poolId, 'SWAP_IN', plan.swapEth, null, 'SIMULATED',
            `quote ${quoted} token1, minOut ${minOut}`)
          log(`SIMULATED swap ${plan.swapEth} ETH -> ${plan.poolId.slice(0, 10)} (${w.name})`)
          simulateMint(db, record, latestSnap, w.address, plan, pool, minOut, now)
          continue
        }

        if (!account) throw new Error('akun live belum ter-decrypt')
        const balance = await client.getBalance({ address: account.address })
        // Buffer gas L2 (murah): swap+approve+mint ~beberapa tx. 0.0005 ETH cukup.
        // Saldo kurang → SKIP bersih (bukan FAILED); budget planEntries sudah membatasi.
        if (balance < tx.value + 5n * 10n ** 14n) {
          log(`skip ${plan.poolId.slice(0, 10)}: saldo agent kurang utk deploy + gas`)
          continue
        }

        // Simulasi STATE NYATA (saldo & harga sungguhan) tepat sebelum kirim — tahu
        // tx bakal sukses/gagal. Gagal (slippage/pool geser) → SKIP, tak buang gas.
        try {
          await client.call({ account: account.address, to: tx.to, data: tx.data, value: tx.value })
        } catch {
          log(`skip ${plan.poolId.slice(0, 10)}: simulasi state nyata gagal (slippage/pool) — tak dikirim`)
          continue
        }

        const wc = createWalletClient({
          account,
          chain: robinhoodChain,
          transport: http(RPC_URL, { retryCount: 8, retryDelay: 1000 }),
        })
        const hash = await wc.sendTransaction({ to: tx.to, data: tx.data, value: tx.value })
        record.run(now, w.address, plan.poolId, 'SWAP_IN', plan.swapEth, hash, 'SENT', null)
        log(`SENT ${hash}`)
        const receipt = await client.waitForTransactionReceipt({ hash })
        recordTok.run(now, w.address, plan.poolId, 'SWAP_IN', plan.swapEth, hash,
          receipt.status === 'success' ? 'CONFIRMED' : 'FAILED', `block ${receipt.blockNumber}`,
          toTok(quoted, pool.currency1))
        log(`${receipt.status === 'success' ? 'CONFIRMED' : 'FAILED'} ${hash}`)

        // Swap sukses → mint posisi LP on-chain dari ETH sisa + token1 hasil swap.
        if (receipt.status === 'success') await finalizeMint()
      } catch (err) {
        record.run(now, w.address, plan.poolId, 'SWAP_IN', plan.swapEth, null, 'FAILED', String(err))
        log(`FAILED swap ${plan.poolId.slice(0, 10)} (${w.name}): ${err}`)
      }
    }
  }
  log(`executor selesai (mode ${live ? 'LIVE' : 'SIMULASI'})`)
}
