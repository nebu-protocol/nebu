// Grid agent — ONE real tick on PancakeSwap V2 (BNB->token or token->BNB).
// Dry-run by default (quotes only, spends nothing). Real swap ONLY with --live.
//   tsx --env-file=../../.env grid-tick.ts [token] [amountBnb] [--live] [--sell]
// Uses WALLET_PK from env. V2 router = battle-tested, minimal calldata → safe for a demo.
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  formatUnits,
  http,
  parseAbi,
  parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

const V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const; // PancakeSwap V2
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
const TOKENS: Record<string, `0x${string}`> = {
  CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
  USDT: "0x55d398326f99059fF775485246999027B3197955",
};

const routerAbi = parseAbi([
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[])",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[])",
]);
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const SELL = args.includes("--sell");
const pos = args.filter((a) => !a.startsWith("--"));
const sym = (pos[0] ?? "CAKE").toUpperCase();
const amountBnb = pos[1] ?? "0.001";
const token = TOKENS[sym];
if (!token) throw new Error(`unknown token ${sym} (have: ${Object.keys(TOKENS).join(", ")})`);

const raw = (process.env.WALLET_PK || "").trim();
if (!raw) throw new Error("WALLET_PK not set");
const account = privateKeyToAccount((raw.startsWith("0x") ? raw : "0x" + raw) as `0x${string}`);

const pub = createPublicClient({ chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });
const wallet = createWalletClient({ account, chain: bsc, transport: http("https://bsc-dataseed.bnbchain.org") });

const SLIPPAGE = 0.02; // 2%
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300);

async function buy() {
  const amountIn = parseEther(amountBnb);
  const path = [WBNB, token] as const;
  const [, out] = (await pub.readContract({ address: V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [amountIn, path] })) as bigint[];
  const minOut = (out * BigInt(Math.floor((1 - SLIPPAGE) * 1e6))) / 1_000_000n;
  console.log(`BUY  ${amountBnb} BNB -> ${sym}`);
  console.log(`  quote out : ${formatUnits(out, 18)} ${sym}  (minOut ${formatUnits(minOut, 18)} @2% slippage)`);
  if (!LIVE) return console.log("  DRY-RUN — no tx sent. Add --live to execute.");
  const hash = await wallet.writeContract({
    address: V2_ROUTER, abi: routerAbi, functionName: "swapExactETHForTokens",
    args: [minOut, [...path], account.address, deadline()], value: amountIn,
  });
  console.log(`  SENT ${hash}`);
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${rc.status} block ${rc.blockNumber}`);
}

async function sell() {
  const bal = (await pub.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [account.address] })) as bigint;
  if (bal === 0n) return console.log(`  no ${sym} balance to sell`);
  const path = [token, WBNB] as const;
  const [, out] = (await pub.readContract({ address: V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [bal, path] })) as bigint[];
  const minOut = (out * BigInt(Math.floor((1 - SLIPPAGE) * 1e6))) / 1_000_000n;
  console.log(`SELL ${formatUnits(bal, 18)} ${sym} -> BNB`);
  console.log(`  quote out : ${formatEther(out)} BNB  (minOut ${formatEther(minOut)} @2% slippage)`);
  if (!LIVE) return console.log("  DRY-RUN — no tx sent. Add --live to execute.");
  const allow = (await pub.readContract({ address: token, abi: erc20, functionName: "allowance", args: [account.address, V2_ROUTER] })) as bigint;
  if (allow < bal) {
    const ah = await wallet.writeContract({ address: token, abi: erc20, functionName: "approve", args: [V2_ROUTER, bal] });
    console.log(`  approve ${ah}`);
    await pub.waitForTransactionReceipt({ hash: ah });
  }
  const hash = await wallet.writeContract({
    address: V2_ROUTER, abi: routerAbi, functionName: "swapExactTokensForETH",
    args: [bal, minOut, [...path], account.address, deadline()],
  });
  console.log(`  SENT ${hash}`);
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${rc.status} block ${rc.blockNumber}`);
}

const bnb = await pub.getBalance({ address: account.address });
console.log(`wallet ${account.address} — ${formatEther(bnb)} BNB — mode ${LIVE ? "LIVE" : "DRY-RUN"}`);
await (SELL ? sell() : buy());
