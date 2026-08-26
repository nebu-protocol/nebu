import { run as activity } from './activity.ts'
import { run as snapshot } from './snapshot.ts'
import { run as plan } from '../strategy/plan.ts'
import { run as execute } from '../executor/executor.ts'
import { run as pnl } from '../report/pnl.ts'
import { run as positionsLive } from '../report/positions-live.ts'
import { run as exitManager } from '../strategy/exit-manager.ts'
import { run as price } from '../price/ethusd.ts'
import { log, sleep } from '../../core/util.ts'

/** Satu siklus: activity→snapshot→plan→execute→pnl→positions-live(PnL nyata)→exit-manager. */
async function cycle() {
  const steps: [string, () => Promise<unknown>][] = [
    ['price', () => price()],
    ['activity', () => activity(['1'])],
    ['snapshot', () => snapshot([])],
    ['plan', () => plan()],
    ['execute', () => execute()],
    ['pnl', () => pnl()],
    ['positions-live', () => positionsLive()],
    ['exit-manager', () => exitManager()], // stop-loss/take-profit/out-of-range
  ]
  for (const [name, fn] of steps) {
    try {
      await fn()
    } catch (e) {
      log(`${name} gagal (lanjut step berikut): ${e}`)
    }
  }
}

/**
 * Collector. Dua mode:
 *   collect once   → satu siklus lalu keluar (untuk cron/launchd — TAHAN reboot).
 *   collect [menit]→ loop internal tiap N menit (default 60; mati kalau proses mati).
 * Untuk durabilitas, pakai `once` + scheduler OS. Lihat scripts/lpbot.plist.
 */
export async function run(args: string[]) {
  if (args[0] === 'once') {
    await cycle()
    log('siklus tunggal selesai')
    return
  }
  const intervalMin = Number(args[0] ?? 60)
  for (;;) {
    const started = Date.now()
    await cycle()
    const elapsedMin = (Date.now() - started) / 60_000
    const waitMin = Math.max(intervalMin - elapsedMin, 1)
    log(`siklus selesai ${elapsedMin.toFixed(1)}m — tidur ${waitMin.toFixed(1)}m`)
    await sleep(waitMin * 60_000)
  }
}
