// Concierge: terjemah tujuan bahasa natural → rekomendasi agent. Deterministik (rule-based)
// biar demo selalu jalan; struktur output siap kalau nanti di-upgrade ke LLM. Data murni.
import { AGENTS, type AgentCategory, type AgentMeta, byCategory } from "./agents";

const KEYWORDS: Record<AgentCategory, string[]> = {
  health: ["liquidat", "loan", "borrow", "collateral", "venus", "debt", "health factor", "margin", "leverage"],
  yield: ["yield", "earn", "passive", "idle", "compound", "apy", "apr", "interest", "stake", "deposit"],
  grid: ["grid", "volatil", "sideways", "range", "buy low", "sell high", "swing", "oscillat", "choppy", "scalp"],
  rebalancing: ["liquidity", "lp", "market make", "fees", "provide", "pool", "concentrated", "rebalance", "pancake"],
};

const AGGRESSIVE = ["aggressive", "degen", "high risk", "max", "yolo", "risky", "moonshot"];
const CONSERVATIVE = ["safe", "low risk", "careful", "protect", "conservative", "stable", "cautious", "secure"];

export type Risk = "conservative" | "balanced" | "aggressive";

export interface Reco {
  primary: AgentMeta;
  team: AgentMeta[];
  reason: string;
  risk: Risk;
  capBnb: number | null;
}

const BNB_USD = 700; // kasar — cuma buat saran cap awal

function parseBudget(p: string): number | null {
  const bnb = p.match(/([\d.]+)\s*bnb/i);
  if (bnb) return Math.min(1000, parseFloat(bnb[1]!));
  const usd = p.match(/\$\s*([\d,]+(?:\.\d+)?)|([\d,]+)\s*(?:usd|dollar|usdt|usdc)/i);
  if (usd) {
    const n = parseFloat((usd[1] ?? usd[2] ?? "").replace(/,/g, ""));
    if (Number.isFinite(n)) return Math.min(1000, +(n / BNB_USD).toFixed(2));
  }
  return null;
}

/** Cocokkan tujuan → agent primary + tim pelengkap + alasan. Selalu balikin sesuatu. */
export function recommend(prompt: string): Reco {
  const p = prompt.toLowerCase();

  // skor tiap kategori dari kata kunci
  const scores = (Object.keys(KEYWORDS) as AgentCategory[]).map((cat) => ({
    cat,
    score: KEYWORDS[cat].reduce((s, k) => s + (p.includes(k) ? 1 : 0), 0),
  }));
  scores.sort((a, b) => b.score - a.score);
  const topCat = scores[0]!.score > 0 ? scores[0]!.cat : "rebalancing"; // default: LP
  const primary = byCategory(topCat)[0] ?? AGENTS[0]!;

  const risk: Risk = AGGRESSIVE.some((k) => p.includes(k))
    ? "aggressive"
    : CONSERVATIVE.some((k) => p.includes(k))
      ? "conservative"
      : "balanced";

  // tim: primary + Guardian kalau ada sinyal likuidasi/proteksi & primary bukan health
  const team: AgentMeta[] = [primary];
  const wantsGuard = KEYWORDS.health.some((k) => p.includes(k)) || CONSERVATIVE.some((k) => p.includes(k));
  const guardian = AGENTS.find((a) => a.category === "health");
  if (wantsGuard && guardian && primary.category !== "health") team.push(guardian);

  const capBnb = parseBudget(prompt);

  const why: Record<AgentCategory, string> = {
    health: "you mentioned protecting a loan from liquidation",
    yield: "you want to earn on idle capital",
    grid: "you want to work a volatile / ranging market",
    rebalancing: "concentrated liquidity market-making fits best",
  };
  let reason = `Because ${why[topCat]}, ${primary.name} is the best fit.`;
  if (team.length > 1) reason += ` Pair it with ${team[1]!.name} to guard against liquidation.`;
  reason += risk === "aggressive" ? " Set an aggressive risk profile." : risk === "conservative" ? " Keep a conservative risk profile." : "";

  return { primary, team, reason, risk, capBnb };
}
