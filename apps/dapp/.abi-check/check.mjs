// Encoding self-check: the dapp's hand-written ABIs vs the compiled Foundry
// artifacts (selectors + event topics), plus calldata round-trips.
// Run from apps/dapp:
//   pnpm exec tsc src/lib/live/chain.ts --ignoreConfig --outDir .abi-check \
//     --module esnext --target es2020 --moduleResolution bundler --skipLibCheck
//   node .abi-check/check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { encodeFunctionData, toEventSelector, toFunctionSelector, toFunctionSignature } from "viem";
import { invoiceMarketAbi, maturitySettlementAbi, quoteConsumedAbi } from "./chain.js";

const OUT = new URL("../../../contracts/out/", import.meta.url).pathname;
const artifact = (name) => JSON.parse(readFileSync(`${OUT}/${name}.sol/${name}.json`, "utf8"));

const market = artifact("InvoiceMarket");
const settlement = artifact("MaturitySettlement");
const oracle = artifact("DiscountOracle");

function checkFunctions(abi, art, label) {
  for (const item of abi.filter((i) => i.type === "function")) {
    const sig = toFunctionSignature(item);
    const expected = art.methodIdentifiers[sig];
    assert.ok(expected, `${label}: ${sig} not in artifact methodIdentifiers`);
    assert.equal(toFunctionSelector(item).slice(2), expected, `${label}: selector mismatch ${sig}`);
  }
}

function checkEvents(abi, art, label) {
  const artTopics = new Map(
    art.abi.filter((i) => i.type === "event").map((i) => [i.name, toEventSelector(i)]),
  );
  for (const item of abi.filter((i) => i.type === "event")) {
    assert.equal(toEventSelector(item), artTopics.get(item.name), `${label}: topic0 ${item.name}`);
  }
}

checkFunctions(invoiceMarketAbi, market, "InvoiceMarket");
checkEvents(invoiceMarketAbi, market, "InvoiceMarket");
checkFunctions(maturitySettlementAbi, settlement, "MaturitySettlement");
checkEvents(maturitySettlementAbi, settlement, "MaturitySettlement");
checkEvents(quoteConsumedAbi, oracle, "DiscountOracle");

// Errors decoded from reverts: selectors must match the artifacts too.
const artErrors = new Map(
  [...market.abi, ...settlement.abi, ...oracle.abi, ...artifact("PegGuard").abi]
    .filter((i) => i.type === "error")
    .map((i) => [i.name, toFunctionSelector({ ...i, type: "function", outputs: [] })]),
);
for (const item of [...invoiceMarketAbi, ...maturitySettlementAbi].filter(
  (i) => i.type === "error",
)) {
  const expected = artErrors.get(item.name);
  assert.ok(expected, `error ${item.name} not found in artifacts`);
  assert.equal(
    toFunctionSelector({ ...item, type: "function", outputs: [] }),
    expected,
    `error selector mismatch ${item.name}`,
  );
}

// Calldata round-trips for the txs the dapp sends.
const invoiceId = `0x${"ab".repeat(32)}`;
const buy = encodeFunctionData({
  abi: invoiceMarketAbi,
  functionName: "buyPrimary",
  args: [invoiceId, 7n],
});
assert.equal(buy.slice(0, 10), `0x${market.methodIdentifiers["buyPrimary(bytes32,uint256)"]}`);
assert.equal(buy.length, 2 + 8 + 64 * 2, "buyPrimary calldata length");

const claim = encodeFunctionData({
  abi: maturitySettlementAbi,
  functionName: "claim",
  args: [invoiceId],
});
assert.equal(claim.slice(0, 10), `0x${settlement.methodIdentifiers["claim(bytes32)"]}`);
assert.equal(claim.length, 2 + 8 + 64, "claim calldata length");

console.info("ok: ABIs match Foundry artifacts; buyPrimary/claim calldata verified");
