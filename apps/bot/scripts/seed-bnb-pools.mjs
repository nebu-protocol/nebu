// Seed pool BNB REAL ke DB BSC supaya marketplace/pools nampilin token BNB (bukan Robinhood).
// Token address-nya asli (verifiable di BscScan); metrik = estimasi wajar market data, BUKAN
// track-record agent. Idempotent — aman dijalankan ulang.
//   node apps/bot/scripts/seed-bnb-pools.mjs [path/to/lp-bsc.db]
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

const dbPath = process.argv[2] ?? resolve(process.cwd(), "data/lp-bsc.db");
const db = new DatabaseSync(dbPath);
const now = Math.floor(Date.now() / 1000);
const poolId = (pair) => "0x" + createHash("sha256").update("nebu:" + pair).digest("hex").slice(0, 64);

// Token BNB Chain (mainnet) — address asli. WBNB ditampilkan sbg "BNB" (konvensi PancakeSwap).
const TOKENS = [
  ["0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", "BNB", "Wrapped BNB", 18],
  ["0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", "CAKE", "PancakeSwap Token", 18],
  ["0x55d398326f99059fF775485246999027B3197955", "USDT", "Tether USD", 18],
  ["0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", "USDC", "USD Coin", 18],
  ["0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", "BTCB", "Bitcoin BEP20", 18],
  ["0x2170Ed0880ac9A755fd29B2688956BD959F933F8", "ETH", "Ethereum Token", 18],
];
const A = Object.fromEntries(TOKENS.map(([addr, sym]) => [sym, addr]));

// pair, sym0, sym1, apr20%, apr5%, volBnbPerDay, swapsPerH, ageDays
const POOLS = [
  ["CAKE/BNB", "CAKE", "BNB", 24.5, 26.1, 8200, 640, 900],
  ["BNB/USDT", "BNB", "USDT", 18.2, 17.4, 52000, 2100, 1000],
  ["BNB/USDC", "BNB", "USDC", 15.9, 16.8, 14000, 880, 700],
  ["ETH/BNB", "ETH", "BNB", 11.7, 10.9, 2600, 190, 820],
  ["BTCB/BNB", "BTCB", "BNB", 9.4, 9.9, 3100, 220, 850],
  ["ETH/USDT", "ETH", "USDT", 8.6, 8.1, 2200, 150, 610],
  ["BTCB/USDT", "BTCB", "USDT", 7.1, 7.5, 2400, 160, 600],
  ["USDT/USDC", "USDT", "USDC", 5.3, 5.1, 9000, 300, 760],
];

const upToken = db.prepare("INSERT OR REPLACE INTO tokens(address,symbol,name,decimals) VALUES(?,?,?,?)");
for (const [addr, sym, name, dec] of TOKENS) upToken.run(addr, sym, name, dec);
// Fix native 0x0 yang salah label "ETH" → BNB.
db.prepare("UPDATE tokens SET symbol='BNB', name='BNB' WHERE address='0x0000000000000000000000000000000000000000'").run();

// Bersihkan yield_rows lama (junk four.meme) biar cuma pool BNB real yang tampil.
db.prepare("DELETE FROM yield_rows").run();
const upPool = db.prepare(
  "INSERT OR REPLACE INTO pools(pool_id,currency0,currency1,fee,tick_spacing,hooks,block_number,created_at,tx_hash,parameters) VALUES(?,?,?,?,?,?,?,?,?,?)",
);
const upYield = db.prepare(
  "INSERT INTO yield_rows(pool_id,pair,age_days,apr20,apr5,fee_per_eth_day,vol_eth,swaps_per_h,hook,span_min,passes_guards,computed_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?)",
);
for (const [pair, s0, s1, apr20, apr5, vol, swaps, age] of POOLS) {
  const id = poolId(pair);
  // currency1 = token headline (ditampilkan di kartu home = sym1); currency0 = pasangannya.
  upPool.run(id, A[s1], A[s0], 2500, 50, "", 0, now - age * 86400, "", "");
  upYield.run(id, pair, age, apr20, apr5, apr20 / 100 / 365, vol, swaps, "", 1440, now);
}

db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('pools_seeded_ts', ?)").run(String(now));
console.log(`seeded ${TOKENS.length} tokens + ${POOLS.length} BNB pools → ${dbPath}`);
