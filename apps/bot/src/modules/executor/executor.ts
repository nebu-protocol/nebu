import { createWalletClient, encodeAbiParameters, encodeFunctionData, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { client } from '../../core/chain.ts'
import { decryptSecret } from '../../core/crypto.ts'
import { openDb } from '../../core/db.ts'
import { log } from '../../core/util.ts'
import { ADDRESSES, NATIVE, robinhoodChain, RPC_URL } from '../../config/index.ts'
import { encodeMintPosition } from './mint.ts'
import { encodeBurnPosition } from './burn.ts'
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

/** Sizing murni: cap fund per pool; separuh dialokasikan untuk di-swap ke token1. */
export function planEntries(enters: EntryDecision[], w: WalletFunds): EntryPlan[] {
  return enters
    .map((e) => {
      const totalEth = Math.min(w.fund_eth * e.sizeFraction, w.max_per_pool_eth)
      return {
        poolId: e.poolId,
        totalEth,
        swapEth: w.autoswap ? totalEth / 2 : 0,
        widthFactor: e.widthFactor ?? 1.2,
      }
    })
    .filter((p) => p.totalEth > 0)
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
  // ponytail: dedup selamanya per (wallet, pool, kind) — re-entry menyusul bersama position tracking
  const alreadyDone = db.prepare(
    `SELECT 1 FROM executions WHERE wallet = ? AND pool_id = ? AND kind = 'SWAP_IN' AND status != 'FAILED' LIMIT 1`,
  )

  for (const w of wallets) {
    // EXIT dulu: tutup posisi OPEN yang strategist tandai keluar (v1 simulasi).
    for (const ex of exits) {
      const now = Math.floor(Date.now() / 1000)
      if (live) {
        record.run(now, w.address, ex.pool_id, 'BURN', null, null, 'FAILED',
          'burn live belum didukung — butuh tokenId dari mint on-chain')
        continue
      }
      simulateExit(db, record, w.address, ex.pool_id, ex, now)
    }

    const plans = planEntries(
      enters.map((e) => ({
        poolId: e.pool_id,
        sizeFraction: e.size_fraction,
        widthFactor: e.width_factor,
      })),
      w,
    )
    for (const plan of plans) {
      const now = Math.floor(Date.now() / 1000)
      if (plan.swapEth <= 0) continue
      if (alreadyDone.get(w.address, plan.poolId)) continue
      const pool = enters.find((e) => e.pool_id === plan.poolId)!
      if (pool.currency0 !== NATIVE) continue // v1 hanya pasangan ETH

      const amountIn = BigInt(Math.round(plan.swapEth * 1e18))
      try {
        const [quoted] = (await client.readContract({
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
        const minOut = (quoted * (10_000n - SLIPPAGE_BPS)) / 10_000n
        const tx = encodeV4SwapEthIn(pool, amountIn, minOut, BigInt(now + 600))

        // simulasi dengan saldo sintetis — memvalidasi calldata tanpa dana
        await client.call({
          account: w.address as `0x${string}`,
          to: tx.to,
          data: tx.data,
          value: tx.value,
          stateOverride: [
            { address: w.address as `0x${string}`, balance: tx.value + 10n ** 17n },
          ],
        })

        if (!live) {
          record.run(now, w.address, plan.poolId, 'SWAP_IN', plan.swapEth, null, 'SIMULATED',
            `quote ${quoted} token1, minOut ${minOut}`)
          log(`SIMULATED swap ${plan.swapEth} ETH -> ${plan.poolId.slice(0, 10)} (${w.name})`)
          simulateMint(db, record, latestSnap, w.address, plan, pool, minOut, now)
          continue
        }

        if (!secret) throw new Error('LPBOT_KEY_SECRET tidak di-set — tidak bisa decrypt key')
        const account = privateKeyToAccount(decryptSecret(w.enc_pk, secret) as `0x${string}`)
        if (account.address.toLowerCase() !== w.address.toLowerCase())
          throw new Error('alamat hasil decrypt tidak cocok dengan wallet tersimpan')
        const balance = await client.getBalance({ address: account.address })
        if (balance < tx.value + 10n ** 15n) throw new Error(`saldo kurang: ${balance} wei`)

        const wc = createWalletClient({ account, chain: robinhoodChain, transport: http(RPC_URL) })
        const hash = await wc.sendTransaction({ to: tx.to, data: tx.data, value: tx.value })
        record.run(now, w.address, plan.poolId, 'SWAP_IN', plan.swapEth, hash, 'SENT', null)
        log(`SENT ${hash}`)
        const receipt = await client.waitForTransactionReceipt({ hash })
        record.run(now, w.address, plan.poolId, 'SWAP_IN', plan.swapEth, hash,
          receipt.status === 'success' ? 'CONFIRMED' : 'FAILED', `block ${receipt.blockNumber}`)
        log(`${receipt.status === 'success' ? 'CONFIRMED' : 'FAILED'} ${hash}`)
      } catch (err) {
        record.run(now, w.address, plan.poolId, 'SWAP_IN', plan.swapEth, null, 'FAILED', String(err))
        log(`FAILED swap ${plan.poolId.slice(0, 10)} (${w.name}): ${err}`)
      }
    }
  }
  log(`executor selesai (mode ${live ? 'LIVE' : 'SIMULASI'})`)
}
