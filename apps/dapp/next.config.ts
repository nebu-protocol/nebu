import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Origins the Dynamic wallet SDK talks to (observed + WalletConnect stack;
// Dynamic publishes no official CSP list). Extra origins can be appended
// via CSP_CONNECT_EXTRA without a code change.
const dynamicOrigins = [
  "https://*.dynamic.xyz",
  "wss://*.dynamic.xyz",
  // The SDK's live API/log/relay hosts (observed via CSP reports).
  "https://*.dynamicauth.com",
  "wss://*.dynamicauth.com",
  "https://dynamic-static-assets.com",
  "https://*.dynamic-static-assets.com",
  "https://*.walletconnect.com",
  "wss://*.walletconnect.com",
  "https://*.walletconnect.org",
  "wss://*.walletconnect.org",
];

// Live Hedera testnet reads/writes + the Sowee quote API.
const soweeApiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SOWEE_API_URL ?? "http://localhost:8080").origin;
  } catch {
    return "http://localhost:8080";
  }
})();
const hederaOrigins = [
  "https://testnet.mirrornode.hedera.com",
  "https://testnet.hashio.io",
  soweeApiOrigin,
];

const connectSrc = [
  "'self'",
  ...dynamicOrigins,
  ...hederaOrigins,
  process.env.CSP_CONNECT_EXTRA ?? "",
]
  .filter(Boolean)
  .join(" ");

const csp = [
  `default-src 'self'`,
  // Next injects inline bootstrap scripts; wallet crypto libs may need wasm.
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  // *.dynamic.xyz: the widget's network/wallet icons live on
  // app.dynamic.xyz/assets/ (hardcoded in @dynamic-labs/sdk-react-core).
  `img-src 'self' data: blob: https://*.dynamic.xyz https://dynamic-static-assets.com https://*.dynamic-static-assets.com https://*.walletconnect.com`,
  // The Dynamic widget loads DM Sans from jsdelivr.
  `font-src 'self' data: https://cdn.jsdelivr.net`,
  `connect-src ${connectSrc}`,
  `frame-src https://*.dynamic.xyz https://*.dynamicauth.com https://verify.walletconnect.com https://verify.walletconnect.org`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Verification builds set NEXT_DIST_DIR so `next build` never clobbers the
  // dev server's .next cache (a clobbered cache = cold full recompile in dev).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  headers() {
    return Promise.resolve([{ source: "/(.*)", headers: securityHeaders }]);
  },
  experimental: {
    // Turbopack persistent cache (beta): dev restarts reuse compiled output
    // instead of paying the ~30-70s Dynamic-SDK cold compile every time.
    turbopackFileSystemCacheForDev: true,
  },
  turbopack: {
    // apps/dapp is its own pnpm root (see pnpm-workspace.yaml); pin the
    // project root so the parent monorepo's lockfile is never picked up.
    root: __dirname,
  },
};

export default nextConfig;
