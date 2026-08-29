// LP (rebalancing) agent — ONE real liquidity add on PancakeSwap V2 (CAKE/BNB).
// Swaps half the budget to CAKE, then addLiquidityETH. Dry-run default; real only with --live.
//   tsx --env-file=../../.env lp-tick.ts [totalBnb] [--live]
import { createPublicClient, createWalletClient, formatEther, formatUnits, http, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

const V2_ROUTER = "0x10ED43C718714eb63d5aA57B78B54704E256024E" as const;
const WBNB = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c" as const;
const CAKE = "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82" as const;

const routerAbi = parseAbi([
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[])",
  "function addLiquidityETH(address token, uint amountTokenDesired, uint amountTokenMin, uint amountETHMin, address to, uint deadline) payable returns (uint amountToken, uint amountETH, uint liquidity)",
]);
const erc20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
]);

const args = process.argv.slice(2);
const LIVE = args.includes("--live");
const totalBnb = args.find((a) => /^[0-9.]+$/.test(a)) ?? "0.0004";

const raw = (process.env.WALLET_PK || "").trim();
if (!raw) throw new Error("WALLET_PK not set");
const account = privateKeyToAccount((raw.startsWith("0x") ? raw : "0x" + raw) as `0x${string}`);
const rpc = "https://bsc-dataseed.bnbchain.org";
const pub = createPublicClient({ chain: bsc, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: bsc, transport: http(rpc) });
const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 300);
const min = (x: bigint, pct = 0.9) => (x * BigInt(Math.floor(pct * 1e6))) / 1_000_000n;

const half = parseEther(totalBnb) / 2n; // half -> CAKE, half paired
const path = [WBNB, CAKE] as const;
const [, cakeOut] = (await pub.readContract({ address: V2_ROUTER, abi: routerAbi, functionName: "getAmountsOut", args: [half, path] })) as bigint[];

const bnb = await pub.getBalance({ address: account.address });
console.log(`wallet ${account.address} — ${formatEther(bnb)} BNB — mode ${LIVE ? "LIVE" : "DRY-RUN"}`);
console.log(`[LP] add liquidity CAKE/BNB — budget ${totalBnb} BNB`);
console.log(`  step1 swap ${formatEther(half)} BNB -> ~${formatUnits(cakeOut, 18)} CAKE`);
console.log(`  step2 addLiquidity ~${formatUnits(cakeOut, 18)} CAKE + ${formatEther(half)} BNB`);
if (!LIVE) {
  console.log("  DRY-RUN — no tx sent. Add --live to execute.");
  process.exit(0);
}

// 1) swap half -> CAKE
const sh = await wallet.writeContract({
  address: V2_ROUTER, abi: routerAbi, functionName: "swapExactETHForTokens",
  args: [min(cakeOut), [...path], account.address, deadline()], value: half,
});
console.log(`  swap ${sh}`);
await pub.waitForTransactionReceipt({ hash: sh });

// 2) approve CAKE
const cakeBal = (await pub.readContract({ address: CAKE, abi: erc20, functionName: "balanceOf", args: [account.address] })) as bigint;
const allow = (await pub.readContract({ address: CAKE, abi: erc20, functionName: "allowance", args: [account.address, V2_ROUTER] })) as bigint;
if (allow < cakeBal) {
  const ah = await wallet.writeContract({ address: CAKE, abi: erc20, functionName: "approve", args: [V2_ROUTER, cakeBal] });
  console.log(`  approve ${ah}`);
  await pub.waitForTransactionReceipt({ hash: ah });
}

// 3) addLiquidityETH (router refunds any leftover)
const lh = await wallet.writeContract({
  address: V2_ROUTER, abi: routerAbi, functionName: "addLiquidityETH",
  args: [CAKE, cakeBal, min(cakeBal, 0.9), min(half, 0.9), account.address, deadline()], value: half,
});
console.log(`  SENT ${lh}`);
const rc = await pub.waitForTransactionReceipt({ hash: lh });
console.log(`  ${rc.status} block ${rc.blockNumber}`);
