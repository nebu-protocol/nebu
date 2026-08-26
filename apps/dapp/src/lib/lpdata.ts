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

// ---------------------------------------------------- per connected wallet

const isAddr = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a);

/** Pool yang dimasuki wallet (posisi OPEN). */
function walletPools(address: string): string[] {
  if (!isAddr(address)) return [];
  const addr = address.toLowerCase();
  try {
    return (
      getDb()
        .prepare(
          "SELECT DISTINCT pool_id FROM positions WHERE status = 'OPEN' AND token_id IS NOT NULL AND lower(wallet) = ?",
        )
        .all(addr) as { pool_id: string }[]
    ).map((r) => r.pool_id);
  } catch {
    return [];
  }
}

export type WalletPortfolio = {
  fundEth: number;
  ethUsd: number | null;
  positions: number;
  avgNet: number | null;
  winners: number;
};

/** Ringkasan portfolio untuk satu wallet (yang di-connect). */
export function getWalletPortfolio(address: string): WalletPortfolio {
  const ethUsd = getLpStats().ethUsd;
  if (!isAddr(address)) return { fundEth: 0, ethUsd, positions: 0, avgNet: null, winners: 0 };
  const addr = address.toLowerCase();
  try {
    const d = getDb();
    const fundEth =
      (d.prepare("SELECT COALESCE(SUM(fund_eth),0) s FROM wallets WHERE lower(address) = ?").get(addr) as {
        s: number;
      }).s ?? 0;
    const pools = walletPools(addr);
    if (pools.length === 0) return { fundEth, ethUsd, positions: 0, avgNet: null, winners: 0 };
    const q = pools.map(() => "?").join(",");
    const pnl = d.prepare(`SELECT net_pct FROM positions_pnl WHERE pool_id IN (${q})`).all(...pools) as {
      net_pct: number;
    }[];
    const avgNet = pnl.length ? pnl.reduce((s, p) => s + p.net_pct, 0) / pnl.length : null;
    return { fundEth, ethUsd, positions: pools.length, avgNet, winners: pnl.filter((p) => p.net_pct > 0).length };
  } catch {
    return { fundEth: 0, ethUsd, positions: 0, avgNet: null, winners: 0 };
  }
}

/** Seri net-vs-HODL portfolio wallet: rata-rata net_pct per timestamp lintas pool wallet. */
export function getWalletPnlSeries(address: string): SeriesPoint[] {
  const pools = walletPools(address);
  if (pools.length === 0) return [];
  try {
    const q = pools.map(() => "?").join(",");
    const rows = getDb()
      .prepare(`SELECT ts, AVG(net_pct) v FROM pnl_history WHERE pool_id IN (${q}) GROUP BY ts ORDER BY ts`)
      .all(...pools) as { ts: number; v: number }[];
    return rows.map((r) => ({ timestamp: r.ts * 1000, value: r.v }));
  } catch {
    return [];
  }
}

/** Riwayat PnL NYATA agregat wallet (net vs HODL % dari wallet_pnl_hist). */
export function getWalletRealPnlSeries(address: string): SeriesPoint[] {
  if (!isAddr(address)) return [];
  try {
    const rows = getDb()
      .prepare("SELECT ts, net_pct FROM wallet_pnl_hist WHERE lower(wallet) = ? ORDER BY ts")
      .all(address.toLowerCase()) as { ts: number; net_pct: number }[];
    return rows.map((r) => ({ timestamp: r.ts * 1000, value: r.net_pct }));
  } catch {
    return [];
  }
}

/** Seri chart PnL kanonik (dipakai Overview + Portfolio biar SINKRON): real kalau
 *  ≥2 titik, else fallback seri model (banyak titik). */
export function getWalletChartSeries(address: string): { points: SeriesPoint[]; isReal: boolean } {
  const real = getWalletRealPnlSeries(address);
  if (real.length >= 2) return { points: real, isReal: true };
  return { points: getWalletPnlSeries(address), isReal: false };
}

export type WalletPosition = {
  pair: string;
  net_pct: number;
  fees_pct: number;
  il_pct: number;
  history: SeriesPoint[];
};

/** Posisi wallet + PnL saat ini + riwayat net_pct per posisi. */
export function getWalletPositions(address: string): WalletPosition[] {
  const pools = walletPools(address);
  if (pools.length === 0) return [];
  try {
    const d = getDb();
    return pools
      .map((poolId) => {
        const cur = d
          .prepare("SELECT pair, net_pct, fees_pct, il_pct FROM positions_pnl WHERE pool_id = ?")
          .get(poolId) as { pair: string; net_pct: number; fees_pct: number; il_pct: number } | undefined;
        if (!cur) return null;
        const hist = d.prepare("SELECT ts, net_pct FROM pnl_history WHERE pool_id = ? ORDER BY ts").all(poolId) as {
          ts: number;
          net_pct: number;
        }[];
        return {
          pair: cur.pair,
          net_pct: cur.net_pct,
          fees_pct: cur.fees_pct,
          il_pct: cur.il_pct,
          history: hist.map((h) => ({ timestamp: h.ts * 1000, value: h.net_pct })),
        };
      })
      .filter((x): x is WalletPosition => x !== null)
      .sort((a, b) => b.net_pct - a.net_pct);
  } catch {
    return [];
  }
}

/** Kapital ETH yang SEDANG dideploy — hanya leg swap+mint utk pool yang posisinya masih OPEN. */
export function getWalletDeployed(address: string): number {
  if (!isAddr(address)) return 0;
  try {
    const r = getDb()
      .prepare(
        `SELECT COALESCE(SUM(e.amount_eth),0) s FROM executions e
         WHERE lower(e.wallet) = ? AND e.kind IN ('SWAP_IN','MINT') AND e.status IN ('SENT','CONFIRMED')
           AND EXISTS (
             SELECT 1 FROM positions p WHERE p.wallet = e.wallet AND p.pool_id = e.pool_id
               AND p.status = 'OPEN' AND p.token_id IS NOT NULL)`,
      )
      .get(address.toLowerCase()) as { s: number };
    return r.s ?? 0;
  } catch {
    return 0;
  }
}

export type RealPosition = {
  pair: string;
  poolId: string;
  tokenAddr: string | null;
  tickLower: number;
  tickUpper: number;
  status: string;
  entryTs: number;
  netPct: number | null;
  feesPct: number | null;
  ilPct: number | null;
};

/** Posisi NYATA + PnL on-chain (kolom positions.* diisi report/positions-live.ts). */
export function getWalletRealPositions(address: string): RealPosition[] {
  if (!isAddr(address)) return [];
  const addr = address.toLowerCase();
  try {
    return (
      getDb()
        .prepare(
          `SELECT COALESCE(pp.pair, y.pair, 'ETH/' || substr(pos.pool_id,3,6)) AS pair,
                  pos.pool_id, pl.currency1 AS token_addr,
                  pos.tick_lower, pos.tick_upper, pos.status, pos.entry_ts,
                  pos.net_pct, pos.fees_pct, pos.il_pct
           FROM positions pos
           LEFT JOIN positions_pnl pp ON pp.pool_id = pos.pool_id
           LEFT JOIN yield_rows y ON y.pool_id = pos.pool_id
           LEFT JOIN pools pl ON pl.pool_id = pos.pool_id
           WHERE lower(pos.wallet) = ? AND pos.token_id IS NOT NULL AND pos.status = 'OPEN'
           ORDER BY pos.entry_ts DESC`,
        )
        .all(addr) as {
        pair: string;
        pool_id: string;
        token_addr: string | null;
        tick_lower: number;
        tick_upper: number;
        status: string;
        entry_ts: number;
        net_pct: number | null;
        fees_pct: number | null;
        il_pct: number | null;
      }[]
    ).map((r) => ({
      pair: r.pair,
      poolId: r.pool_id,
      tokenAddr: r.token_addr,
      tickLower: r.tick_lower,
      tickUpper: r.tick_upper,
      status: r.status,
      entryTs: r.entry_ts,
      netPct: r.net_pct,
      feesPct: r.fees_pct,
      ilPct: r.il_pct,
    }));
  } catch {
    return [];
  }
}

export type RealPnl = {
  deployedEth: number; // Σ entry_cost posisi OPEN
  valueEth: number; // Σ nilai posisi OPEN sekarang (principal+fees)
  pnlEth: number; // valueEth - deployedEth (untung/rugi nyata)
  feesEth: number; // Σ fee terakumulasi
  avgNetPct: number | null;
  winners: number;
  positions: number;
  ts: number | null; // kapan PnL terakhir dihitung
};

/**
 * PnL NYATA wallet = REALIZED (posisi CLOSED: entry×net%) + UNREALIZED (posisi OPEN:
 * value−entry). Jadi "Your PnL" = untung total dari SEMUA LP, bukan cuma yg live.
 */
export function getWalletRealPnl(address: string): RealPnl {
  const empty = { deployedEth: 0, valueEth: 0, pnlEth: 0, feesEth: 0, avgNetPct: null, winners: 0, positions: 0, ts: null };
  if (!isAddr(address)) return empty;
  try {
    const rows = getDb()
      .prepare(
        `SELECT status, cur_value_eth, entry_cost_eth, fees_eth, net_pct, pnl_ts
         FROM positions WHERE lower(wallet) = ? AND token_id IS NOT NULL
           AND entry_cost_eth IS NOT NULL AND net_pct IS NOT NULL`,
      )
      .all(address.toLowerCase()) as {
      status: string;
      cur_value_eth: number | null;
      entry_cost_eth: number;
      fees_eth: number | null;
      net_pct: number;
      pnl_ts: number | null;
    }[];
    if (!rows.length) return empty;
    const open = rows.filter((r) => r.status === "OPEN");
    const closed = rows.filter((r) => r.status === "CLOSED");
    const deployedEth = open.reduce((s, r) => s + (r.entry_cost_eth || 0), 0);
    const valueEth = open.reduce((s, r) => s + (r.cur_value_eth || 0), 0);
    const feesEth = open.reduce((s, r) => s + (r.fees_eth || 0), 0);
    const unrealized = valueEth - deployedEth;
    const realized = closed.reduce((s, r) => s + (r.entry_cost_eth || 0) * ((r.net_pct || 0) / 100), 0);
    const netSrc = open.length ? open : closed;
    const avgNetPct = netSrc.length ? netSrc.reduce((s, r) => s + (r.net_pct || 0), 0) / netSrc.length : null;
    return {
      deployedEth,
      valueEth,
      pnlEth: realized + unrealized, // untung TOTAL: realized + unrealized
      feesEth,
      avgNetPct,
      winners: open.filter((r) => (r.net_pct || 0) > 0).length,
      positions: open.length,
      ts: Math.max(...rows.map((r) => r.pnl_ts || 0)) || null,
    };
  } catch {
    return empty;
  }
}

export type Activity = {
  ts: number;
  kind: string;
  pair: string | null;
  amountEth: number | null;
  status: string;
  detail: string | null;
  txHash: string | null;
  closeNetPct: number | null; // untuk Close LP: net% posisi yg ditutup
  tokenAmount: number | null; // leg token1 (non-ETH)
  tokenSym: string | null; // simbol token1 (dari pair)
  tokenAddr: string | null; // address token1 (untuk logo)
};

/** Riwayat aktivitas wallet (swap/mint/burn/withdraw) dari executions, diperkaya. */
export function getWalletActivity(address: string, limit = 250): Activity[] {
  if (!isAddr(address)) return [];
  const addr = address.toLowerCase();
  try {
    return (
      getDb()
        .prepare(
          `SELECT e.ts, e.kind, e.amount_eth, e.amount_token1, e.status, e.detail, e.tx_hash,
                  COALESCE(pp.pair, y.pair) AS pair, pl.currency1 AS token_addr,
                  (SELECT p.net_pct FROM positions p
                     WHERE p.wallet = e.wallet AND p.pool_id = e.pool_id
                       AND p.status = 'CLOSED' AND p.exit_ts IS NOT NULL
                     ORDER BY p.exit_ts DESC LIMIT 1) AS close_net
           FROM executions e
           LEFT JOIN positions_pnl pp ON pp.pool_id = e.pool_id
           LEFT JOIN yield_rows y ON y.pool_id = e.pool_id
           LEFT JOIN pools pl ON pl.pool_id = e.pool_id
           WHERE lower(e.wallet) = ?
           ORDER BY e.id DESC LIMIT ?`,
        )
        .all(addr, limit) as {
        ts: number;
        kind: string;
        amount_eth: number | null;
        amount_token1: number | null;
        status: string;
        detail: string | null;
        tx_hash: string | null;
        pair: string | null;
        token_addr: string | null;
        close_net: number | null;
      }[]
    ).map((r) => ({
      ts: r.ts,
      kind: r.kind,
      pair: r.pair,
      amountEth: r.amount_eth,
      status: r.status,
      detail: r.detail,
      txHash: r.tx_hash,
      closeNetPct: r.kind === "BURN" ? r.close_net : null,
      tokenAmount: r.amount_token1,
      tokenSym: r.pair ? (r.pair.split("/")[1] ?? null) : null,
      tokenAddr: r.token_addr,
    }));
  } catch {
    return [];
  }
}

export type BotStatus = {
  lastRunTs: number | null;
  simulated: number;
  live: number;
  failed: number;
};

/** Status eksekusi terakhir untuk satu agent — bukti bot jalan + apa hasilnya. */
export function getBotStatus(address: string): BotStatus {
  const empty = { lastRunTs: null, simulated: 0, live: 0, failed: 0 };
  if (!isAddr(address)) return empty;
  try {
    const d = getDb();
    const addr = address.toLowerCase();
    const last = d.prepare("SELECT MAX(ts) t FROM executions WHERE lower(wallet) = ?").get(addr) as {
      t: number | null;
    };
    // Hitung hasil run TERAKHIR saja (cluster ts dalam 120 dtk dari eksekusi terbaru).
    const since = (last.t ?? 0) - 120;
    const rows = d
      .prepare("SELECT status, COUNT(*) n FROM executions WHERE lower(wallet) = ? AND ts >= ? GROUP BY status")
      .all(addr, since) as { status: string; n: number }[];
    const by = (s: string[]) => rows.filter((r) => s.includes(r.status)).reduce((a, r) => a + r.n, 0);
    return {
      lastRunTs: last.t,
      simulated: by(["SIMULATED"]),
      live: by(["SENT", "CONFIRMED"]),
      failed: by(["FAILED"]),
    };
  } catch {
    return empty;
  }
}

/** APR estimasi = rata-rata pool teratas yang lolos guard (target bot). Gross, sim. */
export function getEstApr(topN = 3): number | null {
  try {
    const rows = getDb()
      .prepare("SELECT apr20 FROM yield_rows WHERE passes_guards = 1 ORDER BY apr20 DESC LIMIT ?")
      .all(topN) as { apr20: number }[];
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + r.apr20, 0) / rows.length;
  } catch {
    return null;
  }
}

export type LeaderRow = {
  owner: string;
  avgNet: number;
  positions: number;
  deployedEth: number;
  pnlEth: number;
};

/** Leaderboard: peringkat wallet by rata-rata net vs HODL (posisi OPEN, PnL on-chain). */
export function getLeaderboard(limit = 50): LeaderRow[] {
  try {
    return (
      getDb()
        .prepare(
          `SELECT COALESCE(w.owner, w.address) AS owner,
                  AVG(p.net_pct) AS avg_net,
                  COUNT(p.id) AS positions,
                  COALESCE(SUM(p.entry_cost_eth),0) AS deployed,
                  COALESCE(SUM(p.cur_value_eth - p.entry_cost_eth),0) AS pnl
           FROM wallets w
           JOIN positions p ON lower(p.wallet) = lower(w.address)
             AND p.status = 'OPEN' AND p.token_id IS NOT NULL AND p.net_pct IS NOT NULL
           GROUP BY lower(w.address)
           ORDER BY avg_net DESC
           LIMIT ?`,
        )
        .all(limit) as {
        owner: string;
        avg_net: number;
        positions: number;
        deployed: number;
        pnl: number;
      }[]
    ).map((r) => ({
      owner: r.owner,
      avgNet: r.avg_net,
      positions: r.positions,
      deployedEth: r.deployed,
      pnlEth: r.pnl,
    }));
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

export type PoolRow = {
  poolId: string;
  pair: string;
  sym0: string;
  sym1: string;
  address: string;
  apr20: number;
  feePerEthDay: number;
  volEth: number | null;
  swapsPerH: number;
  spark: number[];
  changePct: number | null;
};

/** Tabel pool ala market: metrik + sparkline; logo dari file lokal (public/tokens/{address}). */
export function getPoolsTable(limit = 30): PoolRow[] {
  try {
    const d = getDb();
    const rows = d
      .prepare(
        `SELECT y.pool_id, y.pair, y.apr20, y.fee_per_eth_day, y.vol_eth, y.swaps_per_h,
                p.currency1 AS addr1, t0.symbol AS sym0, t1.symbol AS sym1
         FROM yield_rows y
         JOIN pools p ON p.pool_id = y.pool_id
         LEFT JOIN tokens t0 ON t0.address = p.currency0
         LEFT JOIN tokens t1 ON t1.address = p.currency1
         WHERE y.passes_guards = 1 ORDER BY y.apr20 DESC LIMIT ?`,
      )
      .all(limit) as {
      pool_id: string;
      pair: string;
      apr20: number;
      fee_per_eth_day: number;
      vol_eth: number | null;
      swaps_per_h: number;
      addr1: string;
      sym0: string | null;
      sym1: string | null;
    }[];

    const sparkStmt = d.prepare(
      "SELECT sqrt_price_x96 FROM pool_snapshots WHERE pool_id = ? ORDER BY ts DESC LIMIT 32",
    );
    return rows.map((r) => {
      const snaps = (sparkStmt.all(r.pool_id) as { sqrt_price_x96: string }[]).reverse();
      const spark = snaps
        .map((s) => {
          const sp = Number(BigInt(s.sqrt_price_x96)) / 2 ** 96;
          return sp * sp;
        })
        .filter((v) => v > 0 && Number.isFinite(v));
      // Δ recent: null kalau harga awal ~0 (menghasilkan % absurd/scientific), clamp ke ±9999%.
      const raw =
        spark.length >= 2 && spark[0] > 1e-9 ? ((spark[spark.length - 1] - spark[0]) / spark[0]) * 100 : null;
      const changePct = raw === null ? null : Math.max(-99.99, Math.min(9999, raw));
      return {
        poolId: r.pool_id,
        pair: r.pair,
        sym0: r.sym0 ?? "ETH",
        sym1: r.sym1 ?? "?",
        address: r.addr1,
        apr20: r.apr20,
        feePerEthDay: r.fee_per_eth_day,
        volEth: r.vol_eth,
        swapsPerH: r.swaps_per_h,
        spark,
        changePct,
      };
    });
  } catch {
    return [];
  }
}

/** Saldo ETH on-chain (dalam ETH) untuk satu address. */
export async function getBalanceEth(address: string): Promise<number | null> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return null;
  const rpc = process.env.ROBINHOOD_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com";
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
      signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json()) as { result?: string };
    return j.result ? Number(BigInt(j.result)) / 1e18 : null;
  } catch {
    return null;
  }
}
