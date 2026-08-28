// Venus (BSC) executor — Yield agent (supply BNB -> vBNB, earn APY) + Guardian agent
// (monitor account liquidity / health). Dry-run default; real tx only with --live.
//   tsx --env-file=../../.env venus-tick.ts monitor
//   tsx --env-file=../../.env venus-tick.ts supply 0.0005 [--live]
import { createPublicClient, createWalletClient, formatEther, http, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bsc } from "viem/chains";

const VBNB = "0xA07c5b74C9B40447a954e1466938b865b6BBea36" as const; // Venus vBNB (BNB market)
const COMPTROLLER = "0xfD36E2c2a6789Db23113685031d7F16329158384" as const; // Core Pool Comptroller
const BLOCKS_PER_YEAR = 10_512_000n; // BSC ~3s blocks

const vbnbAbi = parseAbi([
  "function mint() payable",
  "function redeemUnderlying(uint) returns (uint)",
  "function balanceOf(address) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function symbol() view returns (string)",
  "function supplyRatePerBlock() view returns (uint256)",
]);
const comptrollerAbi = parseAbi([
  "function enterMarkets(address[]) returns (uint256[])",
  "function getAccountLiquidity(address) view returns (uint256, uint256, uint256)",
  "function checkMembership(address, address) view returns (bool)",
]);

const args = process.argv.slice(2);
const cmd = args[0] ?? "monitor";
const LIVE = args.includes("--live");
const amountBnb = args.find((a) => /^[0-9.]+$/.test(a)) ?? "0.0005";

const raw = (process.env.WALLET_PK || "").trim();
if (!raw) throw new Error("WALLET_PK not set");
const account = privateKeyToAccount((raw.startsWith("0x") ? raw : "0x" + raw) as `0x${string}`);
const rpc = "https://bsc-dataseed.bnbchain.org";
const pub = createPublicClient({ chain: bsc, transport: http(rpc) });
const wallet = createWalletClient({ account, chain: bsc, transport: http(rpc) });

async function monitor() {
  const sym = (await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "symbol" })) as string;
  const [, liquidity, shortfall] = (await pub.readContract({
    address: COMPTROLLER, abi: comptrollerAbi, functionName: "getAccountLiquidity", args: [account.address],
  })) as [bigint, bigint, bigint];
  const vbal = (await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "balanceOf", args: [account.address] })) as bigint;
  const rate = (await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "exchangeRateStored" })) as bigint;
  const supplied = (vbal * rate) / 10n ** 18n; // in BNB (wei)
  const rateBlk = (await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "supplyRatePerBlock" })) as bigint;
  const apy = (Number(rateBlk * BLOCKS_PER_YEAR) / 1e18) * 100;
  console.log(`[Guardian] market ${sym} (verified live)`);
  console.log(`  supplied     : ${formatEther(supplied)} BNB  (vBNB ${formatEther(vbal)})`);
  console.log(`  supply APY   : ${apy.toFixed(2)}%`);
  console.log(`  liquidity    : $${(Number(liquidity) / 1e18).toFixed(2)}  (buffer above liquidation)`);
  console.log(`  shortfall    : $${(Number(shortfall) / 1e18).toFixed(2)}  ${shortfall === 0n ? "→ HEALTHY ✓" : "→ AT RISK — would repay"}`);
}

async function supply() {
  const amt = parseEther(amountBnb);
  const rateBlk = (await pub.readContract({ address: VBNB, abi: vbnbAbi, functionName: "supplyRatePerBlock" })) as bigint;
  const apy = (Number(rateBlk * BLOCKS_PER_YEAR) / 1e18) * 100;
  console.log(`[Yield] supply ${amountBnb} BNB -> Venus vBNB  (APY ~${apy.toFixed(2)}%)`);
  if (!LIVE) return console.log("  DRY-RUN — no tx sent. Add --live to execute.");
  const member = (await pub.readContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName: "checkMembership", args: [account.address, VBNB] })) as boolean;
  if (!member) {
    const eh = await wallet.writeContract({ address: COMPTROLLER, abi: comptrollerAbi, functionName: "enterMarkets", args: [[VBNB]] });
    console.log(`  enterMarkets ${eh}`);
    await pub.waitForTransactionReceipt({ hash: eh });
  }
  const hash = await wallet.writeContract({ address: VBNB, abi: vbnbAbi, functionName: "mint", value: amt });
  console.log(`  SENT ${hash}`);
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`  ${rc.status} block ${rc.blockNumber}`);
}

const bnb = await pub.getBalance({ address: account.address });
console.log(`wallet ${account.address} — ${formatEther(bnb)} BNB — cmd ${cmd} — mode ${LIVE ? "LIVE" : "DRY-RUN"}`);
if (cmd === "supply") await supply();
else await monitor();
