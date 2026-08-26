import { openDb, setMeta } from '../../core/db.ts'
import { log } from '../../core/util.ts'

/**
 * Statistik "edge" strategi dari net% posisi CLOSED (pure, diuji). Riset exit: seluruh
 * profit ada di FAT TAIL — strategi cuma positif kalau rasio avg-win/avg-loss ≥ ~4.2
 * pada win-rate ~20%. Di bawah itu, tuning exit pun tak menyelamatkan. Instrumentasi =
 * aksi bernilai tertinggi: user bisa lihat & pause manual kalau edge mengecil.
 */
export function edgeStats(nets: number[]): {
  sample: number
  winRate: number
  avgWin: number
  avgLoss: number
  ratio: number | null
} {
  const sample = nets.length
  const wins = nets.filter((n) => n > 0)
  const losses = nets.filter((n) => n <= 0)
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0) / losses.length) : 0
  const winRate = sample ? wins.length / sample : 0
  // ratio null kalau belum ada loss (tak bisa dihitung) — jangan klaim edge sehat.
  const ratio = avgLoss > 0 ? avgWin / avgLoss : null
  return { sample, winRate, avgWin, avgLoss, ratio }
}

const MIN_RATIO = Number(process.env.EDGE_MIN_RATIO ?? 4.2)
const MIN_SAMPLE = Number(process.env.EDGE_MIN_SAMPLE ?? 12)
const WINDOW = Number(process.env.EDGE_WINDOW ?? 40)

/** Hitung edge dari window closed terbaru → simpan ke meta (dibaca dapp) + log. */
// eslint-disable-next-line @typescript-eslint/require-await
export async function run() {
  const db = openDb()
  const nets = (
    db
      .prepare(
        `SELECT net_pct FROM positions WHERE status='CLOSED' AND net_pct IS NOT NULL
         ORDER BY exit_ts DESC LIMIT ?`,
      )
      .all(WINDOW) as { net_pct: number }[]
  ).map((r) => r.net_pct)
  const s = edgeStats(nets)
  setMeta(db, 'edge_ratio', s.ratio == null ? '' : s.ratio.toFixed(2))
  setMeta(db, 'edge_winrate', (s.winRate * 100).toFixed(0))
  setMeta(db, 'edge_sample', String(s.sample))
  // Riwayat per jam (bucket ts ke jam biar tak spam saat exit-watch cepat) → tren.
  const hourTs = Math.floor(Date.now() / 3_600_000) * 3600
  db.prepare(
    `INSERT INTO edge_history (ts, ratio, win_rate, sample) VALUES (?, ?, ?, ?)
     ON CONFLICT(ts) DO UPDATE SET ratio=excluded.ratio, win_rate=excluded.win_rate, sample=excluded.sample`,
  ).run(hourTs, s.ratio, s.winRate * 100, s.sample)
  const health =
    s.ratio == null || s.sample < MIN_SAMPLE
      ? 'sampel kurang'
      : s.ratio >= MIN_RATIO
        ? 'SEHAT'
        : `LEMAH (< ${MIN_RATIO} — edge tipis, pertimbangkan pause)`
  log(
    `edge: ratio ${s.ratio?.toFixed(2) ?? 'n/a'}:1 · win ${(s.winRate * 100).toFixed(0)}% · ` +
      `avgW +${s.avgWin.toFixed(0)}% avgL -${s.avgLoss.toFixed(0)}% · ${s.sample} closed → ${health}`,
  )
}
