import { run as activity } from './activity.ts'
import { run as snapshot } from './snapshot.ts'
import { run as plan } from '../strategy/plan.ts'
import { run as execute } from '../executor/executor.ts'
import { run as pnl } from '../report/pnl.ts'
import { run as positionsLive } from '../report/positions-live.ts'
import { run as exitManager } from '../strategy/exit-manager.ts'
import { run as price } from '../price/ethusd.ts'
import { log, sleep } from '../../core/util.ts'

const guard = async (name: string, fn: () => Promise<unknown>) => {
  try {
    await fn()
  } catch (e) {
    log(`${name} gagal (lanjut step berikut): ${e}`)
  }
}

/**
 * Pipeline PENUH (berat): scrape harga → activity → snapshot → plan → execute(mint) →
 * pnl → positions-live(PnL nyata) → exit-manager. Jarang (default 60m).
 */
async function cycle() {
  await guard('price', () => price())
  await guard('activity', () => activity(['1']))
  await guard('snapshot', () => snapshot([]))
  await guard('plan', () => plan())
  await guard('execute', () => execute())
  await guard('pnl', () => pnl())
  await guard('positions-live', () => positionsLive())
  await guard('exit-manager', () => exitManager())
}

/**
 * Exit-watch RINGAN: refresh PnL nyata on-chain + cek stop-loss/price-stop/out-of-range.
 * Cuma baca chain (StateView) + burn saat trigger — murah, jadi bisa SERING. Krusial:
 * memecoin bisa dump 20%+ antar siklus penuh; tanpa watch cepat, stop-loss telat (rugi
 * -34% padahal ambang -15%). Price-stop pakai tick fresh tiap watch, tak nunggu net_pct.
 */
async function exitWatch() {
  await guard('positions-live', () => positionsLive())
  await guard('exit-manager', () => exitManager())
}

/**
 * Collector. Mode:
 *   collect once        → satu siklus penuh lalu keluar (cron/launchd — tahan reboot).
 *   collect [m] [watch] → loop: siklus penuh tiap m menit (default 60), DAN exit-watch
 *                         cepat tiap `watch` menit (default 2 / env EXIT_WATCH_MIN) di sela.
 */
export async function run(args: string[]) {
  if (args[0] === 'once') {
    await cycle()
    log('siklus tunggal selesai')
    return
  }
  const intervalMin = Number(args[0] ?? 60)
  // 1 menit (turun dari 2): dump memecoin cepat → cek lebih sering = overshoot stop
  // lebih kecil (loser realized mendekati ambang, bukan lewat jauh).
  const exitMin = Math.max(Number(args[1] ?? process.env.EXIT_WATCH_MIN ?? 1), 0.5)
  for (;;) {
    const started = Date.now()
    await cycle()
    const deadline = started + intervalMin * 60_000
    log(
      `siklus penuh ${((Date.now() - started) / 60_000).toFixed(1)}m — exit-watch tiap ${exitMin}m sampai siklus berikut`,
    )
    // Sela antar siklus penuh: lindungi modal dengan exit-watch cepat.
    while (Date.now() < deadline) {
      await sleep(Math.min(exitMin * 60_000, deadline - Date.now()))
      if (Date.now() < deadline) await exitWatch()
    }
  }
}
