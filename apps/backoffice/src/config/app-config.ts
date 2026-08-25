import packageJson from "../../package.json";

const currentYear = new Date().getFullYear();

export const APP_CONFIG = {
  name: "LP Bot",
  version: packageJson.version,
  copyright: `© ${currentYear}, LP Bot.`,
  meta: {
    title: "LP Bot — Robinhood Chain",
    description: "Automated Uniswap v4 liquidity provision on Robinhood Chain.",
  },
};
