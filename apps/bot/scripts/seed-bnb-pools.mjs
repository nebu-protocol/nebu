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
  ["0xbA2aE424d960c26247Dd6c32edC70B295c744C43", "DOGE", "Dogecoin", 8],
  ["0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47", "ADA", "Cardano Token", 18],
  ["0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE", "XRP", "XRP Token", 18],
  ["0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD", "LINK", "Chainlink Token", 18],
  ["0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402", "DOT", "Polkadot Token", 18],
  ["0x4338665CBB7B2485A8855A139b75D5e34AB0DB94", "LTC", "Litecoin Token", 18],
  ["0xBf5140A22578168FD562DCcF235E5D43A02ce9B1", "UNI", "Uniswap", 18],
  ["0x4B0F1812e5Df2A09796481Ff14017e6005508003", "TWT", "Trust Wallet Token", 18],
  ["0xfb5B838b6cfEEdC2873aB27866079AC55363D37E", "FLOKI", "FLOKI", 9],
  ["0x2859e4544C4bB03966803b044A93563Bd2D0DD4D", "SHIB", "Shiba Inu", 18],
  ["0xCC42724C6683B7E57334c4E856f4c9965ED682bD", "MATIC", "Matic Token", 18],
  ["0x1CE0c2827e2eF14D5C4f29a091d735A204794041", "AVAX", "Avalanche", 18],
  ["0x0Eb3a705fc54725037CC9e008bDede697f62F335", "ATOM", "Cosmos Token", 18],
  ["0x1Fa4a73a3F0133f0025378af00236f3aBDEE5D63", "NEAR", "NEAR Protocol", 18],
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
  ["DOGE/BNB", "DOGE", "BNB", 31.8, 34.2, 4100, 520, 780],
  ["FLOKI/BNB", "FLOKI", "BNB", 44.6, 41.9, 1800, 610, 420],
  ["SHIB/BNB", "SHIB", "BNB", 28.3, 26.7, 1500, 340, 500],
  ["TWT/BNB", "TWT", "BNB", 22.1, 23.5, 900, 180, 640],
  ["XRP/BNB", "XRP", "BNB", 13.4, 12.8, 3300, 260, 720],
  ["ADA/BNB", "ADA", "BNB", 12.2, 11.6, 2100, 175, 700],
  ["LINK/BNB", "LINK", "BNB", 14.8, 15.3, 1900, 210, 690],
  ["DOT/BNB", "DOT", "BNB", 11.1, 10.4, 1400, 130, 680],
  ["LTC/BNB", "LTC", "BNB", 8.9, 9.2, 1600, 120, 710],
  ["UNI/BNB", "UNI", "BNB", 13.9, 13.1, 1200, 150, 620],
  ["MATIC/BNB", "MATIC", "BNB", 12.7, 13.4, 1300, 160, 650],
  ["AVAX/BNB", "AVAX", "BNB", 15.2, 14.6, 1700, 190, 600],
  ["ATOM/BNB", "ATOM", "BNB", 10.6, 11.0, 1100, 110, 660],
  ["NEAR/BNB", "NEAR", "BNB", 16.4, 17.1, 1450, 200, 540],
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

// Sparkline: seed deret harga (pool_snapshots). Bentuk relatif = mini chart di tabel.
const Q96 = 2 ** 96;
db.prepare("DELETE FROM pool_snapshots").run();
const upSnap = db.prepare(
  "INSERT INTO pool_snapshots(pool_id,ts,sqrt_price_x96,tick,lp_fee,liquidity,fee_growth0,fee_growth1) VALUES(?,?,?,?,?,?,?,?)",
);
const N = 24;
for (const [pair] of POOLS) {
  const id = poolId(pair);
  let h = 0;
  for (const c of pair) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const net = ((h % 280) - 100) / 1000; // tren bersih −10%..+18% per pool
  let price = 1;
  for (let k = 0; k < N; k++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const noise = ((h % 1000) / 1000 - 0.5) * 0.02; // ±1% derau
    price *= 1 + net / N + noise;
    const sqrtX96 = BigInt(Math.round(Math.sqrt(price) * Q96)).toString();
    upSnap.run(id, now - (N - k) * 3600, sqrtX96, 0, 2500, "0", "0", "0");
  }
}

db.prepare("INSERT OR REPLACE INTO meta(key,value) VALUES('pools_seeded_ts', ?)").run(String(now));
console.log(`seeded ${TOKENS.length} tokens + ${POOLS.length} BNB pools → ${dbPath}`);
