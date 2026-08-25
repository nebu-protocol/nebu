// Deterministic visual identity for (fictional) issuers and payors.
// Real company logos are off the table — listings under someone's actual brand
// would fabricate financial records — so every name gets a generated mark:
// same name, same mark, everywhere it appears.

export type Sector =
  | "garment"
  | "agri"
  | "pharma"
  | "freight"
  | "construction"
  | "fisheries"
  | "solar"
  | "wool"
  | "ceramics"
  | "manufacturing"
  | "staffing"
  | "medical";

export const SECTOR_LABELS: Record<Sector, string> = {
  garment: "Garment & Textile",
  agri: "Agri Commodity",
  pharma: "Pharma Distribution",
  freight: "Freight & Logistics",
  construction: "Construction",
  fisheries: "Fisheries",
  solar: "Renewable Energy",
  wool: "Wool & Fibre",
  ceramics: "Ceramics",
  manufacturing: "Manufacturing",
  staffing: "Staffing & Workforce",
  medical: "Medical Supplies",
};

/**
 * The three live seeded bonds: names/sectors come from the seeder's curated
 * dataset (scripts/e2e/src/seed.ts). Neither the chain (generic bond names)
 * nor the quote API (no issuer field) carries these, so the dapp maps them
 * by invoiceId.
 * ponytail: hardcoded map for our own seeded market; move issuer metadata
 * into the API registry when it grows a persistent store.
 */
export const SEEDED_IDENTITIES: Record<string, { issuer: string; payor: string; sector: Sector }> =
  {
    // The settled E2E pilot — the one listing showing the full lifecycle.
    "0x99d6adfea0e3b9960f3774d03d883da8bafec1e6af871b08accede28c504aa53": {
      issuer: "Sowee Pilot Issuance",
      payor: "Sowee Treasury (pilot)",
      sector: "manufacturing",
    },
    "0x1f0e96b3330bc5b9160055c3a551a273f6aeb981fa6604a0ae6db9204cd40b9e": {
      issuer: "PT Andalan Tekstil Mandiri",
      payor: "Nusantara Retail Group",
      sector: "garment",
    },
    "0x974487624526d70ec83dfcf0a553e0f60f9c7860e9d31dd46b104d7c1ca5ee01": {
      issuer: "Adriatic Freight Solutions d.o.o.",
      payor: "Bavaria Machinery Group",
      sector: "freight",
    },
    "0xa1c4c7fa8af9a70959d31bba0cb06d36d4bdda506e4988b3c2fb5795d71c6743": {
      issuer: "Deccan Pharma Distributors",
      payor: "Crescent Hospitals Group",
      sector: "pharma",
    },
    "0x0adeee1e43be279c7b88b1049709106e998ef588600438bb94289bb1aab88d46": {
      issuer: "Cafetales del Sur S.A.",
      payor: "Pacific Grain Traders Ltd",
      sector: "agri",
    },
    "0x82f3d169f7eca2f26abee6f4c8573999930bbe09f2ed98a37926e1a067391347": {
      issuer: "Bosphorus Build Contracting",
      payor: "Anatolia Infrastructure Holding",
      sector: "construction",
    },
  };

/** Curated 2-tone palettes (bg gradient stops + foreground). */
const PALETTES: ReadonlyArray<{ a: string; b: string; fg: string }> = [
  { a: "#0c2d1d", b: "#14663c", fg: "#eafff3" },
  { a: "#101d3b", b: "#2b4d9e", fg: "#eaf1ff" },
  { a: "#3b1020", b: "#8f2d4e", fg: "#ffeaf1" },
  { a: "#2c1b0a", b: "#8a5a1d", fg: "#fff4e0" },
  { a: "#0b2b2e", b: "#1d7a72", fg: "#e6fffb" },
  { a: "#221038", b: "#5d3a9b", fg: "#f1eaff" },
  { a: "#33250b", b: "#a08114", fg: "#fffbe6" },
  { a: "#131313", b: "#4a4a4a", fg: "#f2f2f2" },
  { a: "#0f2f16", b: "#3f8f2d", fg: "#efffe9" },
  { a: "#301616", b: "#a04c2d", fg: "#ffefe9" },
];

export type Mark = {
  paletteA: string;
  paletteB: string;
  fg: string;
  /** 0..5 — geometric accent behind the monogram. */
  motif: number;
  letter: string;
  /** Unique-per-name id suffix for SVG gradient defs. */
  key: string;
};

function hashName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 33) ^ name.charCodeAt(i);
  }
  return h >>> 0;
}

const SKIP_PREFIXES = new Set(["PT", "CV", "UD"]);

/** Monogram letter: first letter of the distinctive word (skips PT/CV/UD). */
function monogramLetter(name: string): string {
  const words = name.split(" ").filter(Boolean);
  const word = words.find((w) => !SKIP_PREFIXES.has(w.toUpperCase())) ?? words[0] ?? "?";
  return (word[0] ?? "?").toUpperCase();
}

export function markFor(name: string): Mark {
  const h = hashName(name);
  const palette = PALETTES[h % PALETTES.length] ?? PALETTES[0];
  return {
    paletteA: palette?.a ?? "#0c2d1d",
    paletteB: palette?.b ?? "#14663c",
    fg: palette?.fg ?? "#eafff3",
    motif: Math.floor(h / PALETTES.length) % 6,
    letter: monogramLetter(name),
    key: `m${h.toString(36)}`,
  };
}
