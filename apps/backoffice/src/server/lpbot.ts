import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Pembaca read-only database bot LP (apps/bot). Kontrak: bot menulis tabel
 * yield_rows + decisions tiap siklus collector; di sini hanya SELECT —
 * tidak ada perhitungan, semua math tetap di bot.
 */
const DB_PATH = process.env.LPBOT_DB_PATH ?? resolve(process.cwd(), "../../data/lp.db");

export type LpYieldRow = {
  pool_id: string;
  pair: string;
  age_days: number | null;
  apr20: number;
  apr5: number;
  fee_per_eth_day: number;
  vol_eth: number | null;
  swaps_per_h: number;
  hook: string;
  span_min: number;
  passes_guards: number;
  computed_at: number;
};

export type LpDecision = {
  ts: number;
  pool_id: string;
  action: "ENTER" | "HOLD" | "EXIT";
  width_factor: number;
  size_fraction: number;
  reason: string | null;
  pair: string | null;
};

export type LpbotSummary = {
  stats: {
    totalPools: number;
    activePools: number;
    lastComputedAt: number | null;
    paused: boolean;
  };
  yields: LpYieldRow[];
  decisions: LpDecision[];
};

/** Wallet TANPA enc_pk — private key tidak pernah meninggalkan sisi server. */
export type LpWallet = {
  address: string;
  name: string;
  fund_eth: number;
  max_per_pool_eth: number;
  automation: number;
  autoswap: number;
  created_at: number;
};

export type LpExecution = {
  id: number;
  ts: number;
  wallet: string;
  pool_id: string;
  kind: string;
  amount_eth: number | null;
  tx_hash: string | null;
  status: string;
  detail: string | null;
};

export function getLpbotWallets(): LpWallet[] {
  return plain(
    getDb()
      .prepare(
        "SELECT address, name, fund_eth, max_per_pool_eth, automation, autoswap, created_at FROM wallets ORDER BY created_at",
      )
      .all() as LpWallet[],
  );
}

export function getLpbotExecutions(limit = 20): LpExecution[] {
  return plain(getDb().prepare("SELECT * FROM executions ORDER BY id DESC LIMIT ?").all(limit) as LpExecution[]);
}

export type LpPositionPnl = {
  pool_id: string;
  pair: string;
  entry_ts: number;
  holding_days: number;
  price_change_pct: number;
  fees_pct: number;
  il_pct: number;
  net_pct: number;
  computed_at: number;
};

export function getLpbotPnl(): LpPositionPnl[] {
  try {
    return plain(getDb().prepare("SELECT * FROM positions_pnl ORDER BY net_pct DESC").all() as LpPositionPnl[]);
  } catch {
    return []; // tabel belum ada (bot versi lama) — tampilkan kosong
  }
}

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec("PRAGMA busy_timeout = 3000"); // collector menulis via WAL — reader aman
  }
  return db;
}

// node:sqlite mengembalikan row ber-prototype null; RSC hanya boleh mengirim
// plain object ke client component. Normalisasi di sini (satu tempat).
const plain = <T>(rows: T[]): T[] => rows.map((r) => ({ ...r }));

export function getLpbotSummary(topN = 25): LpbotSummary {
  const d = getDb();
  const yields = plain(
    d
      .prepare("SELECT * FROM yield_rows WHERE passes_guards = 1 ORDER BY apr20 DESC LIMIT ?")
      .all(topN) as LpYieldRow[],
  );
  const decisions = plain(
    d
      .prepare(
        `SELECT dc.*, y.pair FROM decisions dc
       LEFT JOIN yield_rows y ON y.pool_id = dc.pool_id
       WHERE dc.ts = (SELECT MAX(ts) FROM decisions) ORDER BY dc.action`,
      )
      .all() as LpDecision[],
  );
  const totalPools = (d.prepare("SELECT COUNT(*) AS n FROM pools").get() as { n: number }).n;
  const activePools = (d.prepare("SELECT COUNT(DISTINCT pool_id) AS n FROM swap_windows").get() as { n: number }).n;
  const lastComputedAt =
    (d.prepare("SELECT MAX(computed_at) AS t FROM yield_rows").get() as { t: number | null }).t ?? null;
  const paused =
    (d.prepare("SELECT value FROM meta WHERE key = 'paused'").get() as { value: string } | undefined)?.value === "1";

  return { stats: { totalPools, activePools, lastComputedAt, paused }, yields, decisions };
}
