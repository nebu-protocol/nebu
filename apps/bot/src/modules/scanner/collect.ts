import { run as activity } from './activity.ts'
import { run as snapshot } from './snapshot.ts'
import { run as plan } from '../strategy/plan.ts'
import { run as execute } from '../executor/executor.ts'
import { run as pnl } from '../report/pnl.ts'
import { log, sleep } from '../../core/util.ts'

/** Satu siklus lengkap: activity → snapshot → plan → execute → pnl. Tiap step diisolasi. */
async function cycle() {
  const steps: [string, () => Promise<unknown>][] = [
    ['activity', () => activity(['1'])],
    ['snapshot', () => snapshot([])],
    ['plan', () => plan()],
    ['execute', () => execute()],
    ['pnl', () => pnl()],
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
