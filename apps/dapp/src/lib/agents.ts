// Registry agent untuk marketplace. Tiap agent = "pekerja" onchain yang bisa di-hire
// NON-CUSTODIAL (kerja modalmu, gabisa narik). 4 kategori wajib hackathon:
// rebalancing, grid, yield, health-factor. Data murni — aman diimpor client & server.

export type AgentCategory = "rebalancing" | "grid" | "yield" | "health";
export type AgentStatus = "live" | "beta" | "soon";

export interface AgentMeta {
  id: string;
  name: string;
  tagline: string;
  category: AgentCategory;
  status: AgentStatus;
  emoji: string;
  image: string; // ikon art (public/agents/*.png)
  description: string;
  /** Izin yang di-grant saat hire (scoped vault session). Inti "kerja tapi gabisa narik". */
  permissions: string[];
  /** Sumber metrik live: 'lp' = baca DB (flagship). null = belum ada data live. */
  perfSource: "lp" | null;
}

export interface CategoryMeta {
  key: AgentCategory;
  label: string;
  blurb: string;
  emoji: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: "rebalancing", label: "Rebalancing", emoji: "⚖️", blurb: "Keep liquidity in the range that actually earns." },
  { key: "grid", label: "Grid Trading", emoji: "🔲", blurb: "Buy low, sell high — automatically, inside a range." },
  { key: "yield", label: "Yield", emoji: "🌾", blurb: "Find and compound the best yield for idle capital." },
  { key: "health", label: "Health Factor", emoji: "🛡️", blurb: "Guard loan positions from liquidation, 24/7." },
];

// "Gabisa narik" — kalimat izin ini muncul di kartu hire; sama untuk semua agent.
const NON_CUSTODIAL = "Withdrawals disabled — funds can only return to your own vault";

export const AGENTS: AgentMeta[] = [
  {
    id: "nebu-lp",
    name: "Nebu LP",
    tagline: "Non-custodial concentrated-LP market maker on PancakeSwap Infinity",
    category: "rebalancing",
    status: "live",
    emoji: "⚖️",
    image: "/agents/nebu-lp.png",
    description:
      "Provides concentrated liquidity on BNB Chain and keeps it in range as price moves — picking pools by real fee momentum, dodging honeypots, and exiting on discipline. Every position and its realized PnL is on-chain verifiable.",
    permissions: ["Add / remove liquidity on PancakeSwap Infinity", "Swap only within a vetted token allowlist", NON_CUSTODIAL],
    perfSource: "lp",
  },
  {
    id: "nebu-yield",
    name: "Nebu Yield",
    tagline: "Routes idle capital to the best-yielding BNB venue and compounds it",
    category: "yield",
    status: "live",
    emoji: "🌾",
    image: "/agents/nebu-yield.png",
    description:
      "Scans BNB yield venues, allocates to the best risk-adjusted option, and auto-compounds. Rebalances when a better source appears. You keep custody — the agent only moves funds between whitelisted venues.",
    permissions: ["Stake / unstake in whitelisted yield venues", "Claim & compound rewards", NON_CUSTODIAL],
    perfSource: null,
  },
  {
    id: "nebu-grid",
    name: "Nebu Grid",
    tagline: "Automated buy-low / sell-high across a price grid",
    category: "grid",
    status: "live",
    emoji: "🔲",
    image: "/agents/nebu-grid.png",
    description:
      "Places a ladder of buy/sell orders inside a range on PancakeSwap and works it as price oscillates — turning volatility into realized gains, hands-free. Range and budget are yours to set.",
    permissions: ["Swap within the configured grid range", "Respect your per-order and total budget caps", NON_CUSTODIAL],
    perfSource: null,
  },
  {
    id: "nebu-guardian",
    name: "Nebu Guardian",
    tagline: "Watches your Venus loans and acts before liquidation",
    category: "health",
    status: "live",
    emoji: "🛡️",
    image: "/agents/nebu-guardian.png",
    description:
      "Monitors your lending health factor on BNB Chain and, when it nears the danger zone, repays or tops up collateral automatically — so a market wick doesn't liquidate you. Alerts you every step.",
    permissions: ["Repay debt / add collateral on your Venus position", "Trigger only below your health-factor threshold", NON_CUSTODIAL],
    perfSource: null,
  },
];

export const STATUS_LABEL: Record<AgentStatus, string> = { live: "Live", beta: "Beta", soon: "Coming soon" };

export const byCategory = (cat: AgentCategory): AgentMeta[] => AGENTS.filter((a) => a.category === cat);
export const getAgent = (id: string): AgentMeta | undefined => AGENTS.find((a) => a.id === id);
