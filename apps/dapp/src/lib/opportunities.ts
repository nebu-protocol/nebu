import type { AgentCategory } from "./agents";
import type { PoolRow } from "./lpdata";

// Opportunities per-agent — beda kolom/isi tiap kategori (LP=pool, yield=venue, dst).
export type OppCol = { label: string; right?: boolean; accent?: boolean };
export type OppRow = { cells: string[]; addr?: string; href?: string };
export type Opp = { title: string; columns: OppCol[]; rows: OppRow[] };

const kfmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${Math.round(n)}`);
const vol = (a: number) => (a >= 30 ? "Very high" : a >= 18 ? "High" : a >= 10 ? "Medium" : "Low");
const range = (a: number) => `±${a >= 30 ? 25 : a >= 18 ? 18 : a >= 10 ? 10 : 6}%`;
const pcs = (addr: string) => `https://pancakeswap.finance/token/bsc/${addr}`;

// Venue yield BNB Chain nyata (angka estimatif market).
const YIELD: OppRow[] = [
  { cells: ["PancakeSwap · CAKE Pool", "CAKE", "14.2%", "$180M"] },
  { cells: ["Lista DAO · lisUSD", "lisUSD", "8.1%", "$90M"] },
  { cells: ["Venus · USDT", "USDT", "5.4%", "$310M"] },
  { cells: ["Kernel · BNB", "BNB", "4.3%", "$60M"] },
  { cells: ["Venus · BNB", "BNB", "2.9%", "$420M"] },
];
// Market lending Venus (Guardian jaga posisi di sini).
const VENUS: OppRow[] = [
  { cells: ["BNB", "80%", "2.9%", "4.1%"] },
  { cells: ["USDT", "80%", "5.4%", "7.2%"] },
  { cells: ["USDC", "80%", "5.1%", "6.9%"] },
  { cells: ["BTCB", "75%", "0.8%", "2.3%"] },
  { cells: ["ETH", "75%", "1.1%", "2.8%"] },
];

export function buildOpportunities(category: AgentCategory, pools: PoolRow[]): Opp {
  switch (category) {
    case "rebalancing":
      return {
        title: "LP pools",
        columns: [{ label: "Pool" }, { label: "APR", right: true, accent: true }, { label: "Vol (BNB)", right: true }, { label: "Swaps/h", right: true }],
        rows: pools.slice(0, 10).map((p) => ({
          cells: [p.pair, `${p.apr20.toFixed(1)}%`, kfmt(p.volEth ?? 0), String(Math.round(p.swapsPerH))],
          addr: p.address,
          href: pcs(p.address),
        })),
      };
    case "grid":
      return {
        title: "Grid markets",
        columns: [{ label: "Market" }, { label: "Volatility" }, { label: "Range", right: true }, { label: "In-range APR", right: true, accent: true }],
        rows: pools.slice(0, 8).map((p) => ({
          cells: [p.pair, vol(p.apr20), range(p.apr20), `${p.apr20.toFixed(1)}%`],
          addr: p.address,
          href: pcs(p.address),
        })),
      };
    case "yield":
      return {
        title: "Yield venues",
        columns: [{ label: "Venue" }, { label: "Asset" }, { label: "APY", right: true, accent: true }, { label: "TVL", right: true }],
        rows: YIELD,
      };
    case "health":
      return {
        title: "Venus markets",
        columns: [{ label: "Asset" }, { label: "Collateral factor", right: true }, { label: "Supply APY", right: true, accent: true }, { label: "Borrow APY", right: true }],
        rows: VENUS,
      };
  }
}
