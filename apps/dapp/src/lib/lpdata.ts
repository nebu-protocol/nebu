import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// Baca DB bot LP (read-only), sama seperti backoffice. Semua math tetap di bot.
const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");

let db: DatabaseSync | null = null;
function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA busy_timeout = 3000");
  }
  return db;
}

export type LpStats = {
  activePools: number;
  passingGuards: number;
  avgNet: number | null;
  winners: number;
  positions: number;
  ethUsd: number | null;
  totalFundEth: number;
};

export function getLpStats(): LpStats {
  try {
    const d = getDb();
    const activePools = (d.prepare("SELECT COUNT(DISTINCT pool_id) n FROM swap_windows").get() as { n: number }).n;
    const passingGuards = (d.prepare("SELECT COUNT(*) n FROM yield_rows WHERE passes_guards = 1").get() as { n: number })
      .n;
    const pnl = d.prepare("SELECT net_pct FROM positions_pnl").all() as { net_pct: number }[];
    const avgNet = pnl.length ? pnl.reduce((s, p) => s + p.net_pct, 0) / pnl.length : null;
    const winners = pnl.filter((p) => p.net_pct > 0).length;
    const ethMeta = d.prepare("SELECT value FROM meta WHERE key = 'eth_usd'").get() as { value: string } | undefined;
    const ethUsd = ethMeta ? Number(ethMeta.value) : null;
    const totalFundEth =
      (d.prepare("SELECT COALESCE(SUM(fund_eth),0) s FROM wallets WHERE automation = 1").get() as { s: number }).s ?? 0;
    return { activePools, passingGuards, avgNet, winners, positions: pnl.length, ethUsd, totalFundEth };
  } catch {
    return { activePools: 0, passingGuards: 0, avgNet: null, winners: 0, positions: 0, ethUsd: null, totalFundEth: 0 };
  }
}

export type SeriesPoint = { timestamp: number; value: number };

/**
 * Seri ETH/USD dari time-series pool ETH/USDG terdalam (chart portfolio).
 * value = raw sqrtPrice^2 * 10^(18-decUSDG). Bertambah seiring collector jalan.
 */
export function getEthUsdSeries(): SeriesPoint[] {
  try {
    const d = getDb();
    const pool = d
      .prepare(
        `SELECT p.pool_id, t1.decimals dec1
         FROM pools p JOIN tokens t1 ON t1.address = p.currency1
         JOIN pool_snapshots s ON s.pool_id = p.pool_id
         WHERE p.currency0 = '0x0000000000000000000000000000000000000000' AND t1.symbol = 'USDG'
         GROUP BY p.pool_id
         ORDER BY MAX(CAST(s.liquidity AS REAL)) DESC LIMIT 1`,
      )
      .get() as { pool_id: string; dec1: number } | undefined;
    if (!pool?.dec1) return [];
    const rows = d
      .prepare("SELECT ts, sqrt_price_x96 FROM pool_snapshots WHERE pool_id = ? ORDER BY ts")
      .all(pool.pool_id) as { ts: number; sqrt_price_x96: string }[];
    return rows
      .map((r) => {
        const sp = Number(BigInt(r.sqrt_price_x96)) / 2 ** 96;
        return { timestamp: r.ts * 1000, value: sp * sp * 10 ** (18 - pool.dec1) };
      })
      .filter((p) => p.value > 0 && Number.isFinite(p.value));
  } catch {
    return [];
  }
}

export type TopPool = { pair: string; apr20: number; age_days: number | null };

export function getTopPools(limit = 8): TopPool[] {
  try {
    return (
      getDb()
        .prepare(
          "SELECT pair, apr20, age_days FROM yield_rows WHERE passes_guards = 1 ORDER BY apr20 DESC LIMIT ?",
        )
        .all(limit) as TopPool[]
    ).map((r) => ({ ...r }));
  } catch {
    return [];
  }
}
