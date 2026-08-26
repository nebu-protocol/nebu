import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// repo root = apps/bot/src/core -> up 4
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const DB_PATH = process.env.DB_PATH ?? resolve(repoRoot, 'data/lp.db')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pools (
  pool_id       TEXT PRIMARY KEY,          -- bytes32 v4 PoolId
  currency0     TEXT NOT NULL,
  currency1     TEXT NOT NULL,
  fee           INTEGER NOT NULL,          -- 0x800000 flag = dynamic fee (hook-controlled)
  tick_spacing  INTEGER NOT NULL,
  hooks         TEXT NOT NULL,
  block_number  INTEGER NOT NULL,
  created_at    INTEGER,                   -- unix seconds (block timestamp)
  tx_hash       TEXT
);
CREATE INDEX IF NOT EXISTS idx_pools_created ON pools (created_at);

CREATE TABLE IF NOT EXISTS tokens (
  address  TEXT PRIMARY KEY,
  symbol   TEXT,
  name     TEXT,
  decimals INTEGER
);

CREATE TABLE IF NOT EXISTS pool_snapshots (
  pool_id         TEXT NOT NULL,
  ts              INTEGER NOT NULL,        -- unix seconds
  sqrt_price_x96  TEXT NOT NULL,
  tick            INTEGER NOT NULL,
  lp_fee          INTEGER NOT NULL,
  liquidity       TEXT NOT NULL,
  fee_growth0     TEXT NOT NULL,
  fee_growth1     TEXT NOT NULL,
  PRIMARY KEY (pool_id, ts)
);

-- User login dashboard (multi-user + role). pass_hash = scrypt (lihat core/crypto.ts).
-- role: 'admin' (boleh pause/kelola wallet) | 'viewer' (read-only).
CREATE TABLE IF NOT EXISTS users (
  username   TEXT PRIMARY KEY,
  pass_hash  TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'viewer',
  blocked    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Wallet automation: ditulis backoffice (add/settings), dibaca executor bot.
-- enc_pk = private key terenkripsi AES-256-GCM (lihat core/crypto.ts) — tidak pernah plaintext.
CREATE TABLE IF NOT EXISTS wallets (
  address          TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  enc_pk           TEXT NOT NULL,
  owner            TEXT,                      -- username pemilik (member); NULL = legacy/admin-only
  fund_eth         REAL NOT NULL DEFAULT 0,   -- total modal ETH yang boleh dipakai bot
  max_per_pool_eth REAL NOT NULL DEFAULT 0,   -- cap per pool
  automation       INTEGER NOT NULL DEFAULT 0,
  autoswap         INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS executions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  wallet     TEXT NOT NULL,
  pool_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,                   -- SWAP_IN | MINT | ...
  amount_eth REAL,
  tx_hash    TEXT,
  status     TEXT NOT NULL,                   -- DRY_RUN | SIMULATED | SENT | CONFIRMED | FAILED
  detail     TEXT
);

-- Posisi LP (simulasi/live): satu baris per MINT, ditutup saat EXIT.
-- token_id null di simulasi (belum ada NFT); terisi setelah mint live.
CREATE TABLE IF NOT EXISTS positions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet      TEXT NOT NULL,
  pool_id     TEXT NOT NULL,
  token_id    TEXT,
  tick_lower  INTEGER NOT NULL,
  tick_upper  INTEGER NOT NULL,
  liquidity   TEXT NOT NULL,
  entry_ts    INTEGER NOT NULL,
  exit_ts     INTEGER,
  status      TEXT NOT NULL DEFAULT 'OPEN'      -- OPEN | CLOSED
);
CREATE INDEX IF NOT EXISTS idx_positions_open ON positions (wallet, pool_id, status);

-- Riwayat PnL per posisi (append-only, satu baris per pool per siklus) — untuk chart dapp
CREATE TABLE IF NOT EXISTS pnl_history (
  pool_id  TEXT NOT NULL,
  ts       INTEGER NOT NULL,
  net_pct  REAL NOT NULL,
  fees_pct REAL NOT NULL,
  il_pct   REAL NOT NULL,
  PRIMARY KEY (pool_id, ts)
);

-- Riwayat PnL NYATA agregat per wallet (append tiap siklus positions-live) — chart dapp
CREATE TABLE IF NOT EXISTS wallet_pnl_hist (
  wallet    TEXT NOT NULL,
  ts        INTEGER NOT NULL,
  value_eth REAL NOT NULL,
  entry_eth REAL NOT NULL,
  net_pct   REAL NOT NULL,
  PRIMARY KEY (wallet, ts)
);

-- PnL posisi (simulasi) vs HODL — dibaca backoffice
CREATE TABLE IF NOT EXISTS positions_pnl (
  pool_id          TEXT PRIMARY KEY,
  pair             TEXT NOT NULL,
  entry_ts         INTEGER NOT NULL,
  holding_days     REAL NOT NULL,
  price_change_pct REAL NOT NULL,
  fees_pct         REAL NOT NULL,
  il_pct           REAL NOT NULL,
  net_pct          REAL NOT NULL,
  computed_at      INTEGER NOT NULL
);

-- Materialisasi report yield terakhir — kontrak baca untuk backoffice (SELECT saja)
CREATE TABLE IF NOT EXISTS yield_rows (
  pool_id         TEXT PRIMARY KEY,
  pair            TEXT NOT NULL,
  age_days        REAL,
  apr20           REAL NOT NULL,
  apr5            REAL NOT NULL,
  fee_per_eth_day REAL NOT NULL,
  vol_eth         REAL,
  swaps_per_h     REAL NOT NULL,
  hook            TEXT NOT NULL,
  span_min        REAL NOT NULL,
  passes_guards   INTEGER NOT NULL,
  computed_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  ts            INTEGER NOT NULL,
  pool_id       TEXT NOT NULL,
  action        TEXT NOT NULL,             -- ENTER | HOLD | EXIT
  width_factor  REAL NOT NULL,
  size_fraction REAL NOT NULL,
  reason        TEXT,
  PRIMARY KEY (ts, pool_id)
);

CREATE TABLE IF NOT EXISTS swap_windows (
  pool_id      TEXT NOT NULL,
  from_block   INTEGER NOT NULL,
  to_block     INTEGER NOT NULL,
  from_ts      INTEGER NOT NULL,
  to_ts        INTEGER NOT NULL,
  swap_count   INTEGER NOT NULL,
  volume0      TEXT NOT NULL,              -- sum(abs(amount0)), raw units
  volume1      TEXT NOT NULL,
  PRIMARY KEY (pool_id, from_block, to_block)
);
`

export function openDb(path: string = DB_PATH): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA busy_timeout = 8000') // tunggu lock (collector + step manual bisa bentrok)
  db.exec(SCHEMA)
  // migrasi kolom baru untuk DB lama (aman kalau kolom sudah ada)
  for (const stmt of [
    "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer'",
    'ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE wallets ADD COLUMN owner TEXT',
    // PnL NYATA on-chain per posisi (diisi report/positions-live.ts tiap siklus)
    'ALTER TABLE positions ADD COLUMN cur_value_eth REAL',
    'ALTER TABLE positions ADD COLUMN entry_cost_eth REAL',
    'ALTER TABLE positions ADD COLUMN fees_eth REAL',
    'ALTER TABLE positions ADD COLUMN net_pct REAL',
    'ALTER TABLE positions ADD COLUMN fees_pct REAL',
    'ALTER TABLE positions ADD COLUMN il_pct REAL',
    'ALTER TABLE positions ADD COLUMN pnl_ts INTEGER',
    // puncak net_pct (high-water mark) untuk trailing take-profit
    'ALTER TABLE positions ADD COLUMN peak_net_pct REAL',
    // risk manager per-wallet: profil + ambang custom (dipakai exit-manager)
    "ALTER TABLE wallets ADD COLUMN risk_profile TEXT DEFAULT 'safe'",
    'ALTER TABLE wallets ADD COLUMN risk_stop_loss REAL',
    'ALTER TABLE wallets ADD COLUMN risk_price_stop REAL',
    'ALTER TABLE wallets ADD COLUMN risk_tp_arm REAL',
    'ALTER TABLE wallets ADD COLUMN risk_tp_trail REAL',
    // jumlah token1 (leg non-ETH) untuk aktivitas — human-readable
    'ALTER TABLE executions ADD COLUMN amount_token1 REAL',
  ]) {
    try {
      db.exec(stmt)
    } catch {
      // kolom sudah ada — abaikan
    }
  }
  return db
}

export function getMeta(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

export function setMeta(db: DatabaseSync, key: string, value: string) {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}
