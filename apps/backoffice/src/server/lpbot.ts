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
  owner: string | null;
  fund_eth: number;
  max_per_pool_eth: number;
  automation: number;
  autoswap: number;
  created_at: number;
  has_entered: number; // 1 jika sudah ada SWAP_IN (posisi masuk) — untuk disable tombol Execute
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

/** Admin: semua wallet. Member: hanya miliknya. Viewer: kosong (tak boleh lihat key-bearing rows). */
export function getLpbotWallets(opts: { role: string; username: string }): LpWallet[] {
  if (opts.role === "viewer") return [];
  const cols =
    "address, name, owner, fund_eth, max_per_pool_eth, automation, autoswap, created_at, " +
    "EXISTS(SELECT 1 FROM executions e WHERE e.wallet = wallets.address AND e.kind = 'SWAP_IN' AND e.status != 'FAILED') AS has_entered";
  if (opts.role === "admin") {
    return plain(getDb().prepare(`SELECT ${cols} FROM wallets ORDER BY created_at`).all() as LpWallet[]);
  }
  return plain(
    getDb().prepare(`SELECT ${cols} FROM wallets WHERE owner = ? ORDER BY created_at`).all(opts.username) as LpWallet[],
  );
}

export function getLpbotExecutions(limit = 20): LpExecution[] {
  return plain(getDb().prepare("SELECT * FROM executions ORDER BY id DESC LIMIT ?").all(limit) as LpExecution[]);
}

/**
 * Harga 1 ETH dalam USD. Dibaca dari meta `eth_usd` (di-set bot dari beberapa
 * price feed + fallback tiap siklus) — cepat, tanpa memukul API eksternal per-render.
 * Fallback on-chain (ETH/USDG) kalau meta belum ada.
 */
export function getEthUsd(): number | null {
  try {
    const meta = getDb().prepare("SELECT value FROM meta WHERE key = 'eth_usd'").get() as { value: string } | undefined;
    const cached = meta ? Number(meta.value) : NaN;
    if (cached > 0 && Number.isFinite(cached)) return cached;

    const row = getDb()
      .prepare(
        `SELECT s.sqrt_price_x96 AS sp, t1.decimals AS dec1
         FROM pools p JOIN tokens t1 ON t1.address = p.currency1
         JOIN pool_snapshots s ON s.pool_id = p.pool_id
           AND s.ts = (SELECT MAX(ts) FROM pool_snapshots WHERE pool_id = p.pool_id)
         WHERE p.currency0 = '0x0000000000000000000000000000000000000000' AND t1.symbol = 'USDG'
         ORDER BY CAST(s.liquidity AS REAL) DESC LIMIT 1`,
      )
      .get() as { sp: string; dec1: number } | undefined;
    if (!row?.dec1) return null;
    const sqrtP = Number(BigInt(row.sp)) / 2 ** 96;
    const ethUsd = sqrtP * sqrtP * 10 ** (18 - row.dec1);
    return ethUsd > 0 && Number.isFinite(ethUsd) ? ethUsd : null;
  } catch {
    return null;
  }
}

/** Saldo ETH on-chain (wei, string) per address via JSON-RPC batch. */
export async function getWalletBalances(addresses: string[]): Promise<Record<string, string>> {
  if (addresses.length === 0) return {};
  const rpc = process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
  const body = addresses.map((a, i) => ({
    jsonrpc: "2.0",
    id: i,
    method: "eth_getBalance",
    params: [a, "latest"],
  }));
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { id: number; result?: string }[];
    const out: Record<string, string> = {};
    for (const item of data) {
      const addr = addresses[item.id];
      if (addr) out[addr] = item.result ? BigInt(item.result).toString() : "0";
    }
    return out;
  } catch {
    return {};
  }
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
    d.prepare("SELECT * FROM yield_rows WHERE passes_guards = 1 ORDER BY apr20 DESC LIMIT ?").all(topN) as LpYieldRow[],
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
