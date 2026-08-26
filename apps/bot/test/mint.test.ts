import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeAbiParameters, decodeFunctionData, parseAbi } from 'viem'
import {
  amountsForLiquidity,
  liquidityForAmount0,
  liquidityForAmount1,
  liquidityForAmounts,
  nearestUsableTick,
  rangeFromWidth,
  sqrtRatioX96AtTick,
} from '../src/modules/executor/liquidity-math.ts'
import { encodeMintPosition, MINT_POSITION, SETTLE_PAIR, SWEEP } from '../src/modules/executor/mint.ts'
import { ADDRESSES, NATIVE } from '../src/config/index.ts'

const Q96 = 2n ** 96n

test('sqrtRatioX96AtTick: tick 0 -> 2^96, dan monotonic naik', () => {
  assert.equal(sqrtRatioX96AtTick(0), Q96)
  assert.ok(sqrtRatioX96AtTick(100) > sqrtRatioX96AtTick(0))
  assert.ok(sqrtRatioX96AtTick(-100) < sqrtRatioX96AtTick(0))
})

test('nearestUsableTick: align ke kelipatan spacing', () => {
  assert.equal(nearestUsableTick(107, 60), 120)
  assert.equal(nearestUsableTick(-107, 60), -120)
  assert.equal(nearestUsableTick(0, 60), 0)
})

test('rangeFromWidth: simetris di sekitar tick, align spacing, upper>lower', () => {
  const { tickLower, tickUpper } = rangeFromWidth(0, 60, 1.2)
  assert.ok(tickLower < 0 && tickUpper > 0)
  assert.equal(Math.abs(tickLower % 60), 0)
  assert.equal(Math.abs(tickUpper % 60), 0)
  assert.equal(tickLower, -tickUpper) // simetris di sekitar tick 0
  assert.ok(tickUpper > tickLower)
})

test('rangeFromWidth: width sangat sempit tetap minimal satu spacing', () => {
  const { tickLower, tickUpper } = rangeFromWidth(1000, 60, 1.0001)
  assert.ok(tickUpper >= tickLower + 60)
})

test('liquidityForAmounts: harga 1:1 di dalam range -> min(L0,L1)', () => {
  const sqrtP = Q96 // tick 0
  const sqrtA = sqrtRatioX96AtTick(-600)
  const sqrtB = sqrtRatioX96AtTick(600)
  const amt = 10n ** 18n
  const L = liquidityForAmounts(sqrtP, sqrtA, sqrtB, amt, amt)
  const l0 = liquidityForAmount0(sqrtP, sqrtB, amt)
  const l1 = liquidityForAmount1(sqrtA, sqrtP, amt)
  assert.equal(L, l0 < l1 ? l0 : l1)
  assert.ok(L > 0n)
})

test('liquidityForAmounts: harga di bawah range -> hanya token0; di atas -> hanya token1', () => {
  const sqrtA = sqrtRatioX96AtTick(600)
  const sqrtB = sqrtRatioX96AtTick(1200)
  const amt = 10n ** 18n
  const below = liquidityForAmounts(sqrtRatioX96AtTick(0), sqrtA, sqrtB, amt, 0n)
  const above = liquidityForAmounts(sqrtRatioX96AtTick(2000), sqrtA, sqrtB, 0n, amt)
  assert.ok(below > 0n)
  assert.ok(above > 0n)
})

test('amountsForLiquidity: round-trip dgn liquidityForAmounts (dalam range)', () => {
  const sqrtP = Q96 // tick 0
  const sqrtA = sqrtRatioX96AtTick(-600)
  const sqrtB = sqrtRatioX96AtTick(600)
  const amt = 10n ** 18n
  const L = liquidityForAmounts(sqrtP, sqrtA, sqrtB, amt, amt)
  const { amount0, amount1 } = amountsForLiquidity(sqrtP, sqrtA, sqrtB, L)
  // L dibatasi sisi yg mengikat → salah satu amount ≈ input, keduanya ≤ input, > 0
  assert.ok(amount0 > 0n && amount1 > 0n)
  assert.ok(amount0 <= amt && amount1 <= amt)
  // rekonstruksi L dari amounts hasil ≈ L semula (toleransi pembulatan)
  const L2 = liquidityForAmounts(sqrtP, sqrtA, sqrtB, amount0, amount1)
  const diff = L2 > L ? L2 - L : L - L2
  assert.ok(diff * 10_000n <= L, `L drift terlalu besar: ${diff} vs ${L}`)
})

test('amountsForLiquidity: di bawah range -> token0 saja; di atas -> token1 saja', () => {
  const sqrtA = sqrtRatioX96AtTick(600)
  const sqrtB = sqrtRatioX96AtTick(1200)
  const L = 10n ** 18n
  const below = amountsForLiquidity(sqrtRatioX96AtTick(0), sqrtA, sqrtB, L)
  const above = amountsForLiquidity(sqrtRatioX96AtTick(2000), sqrtA, sqrtB, L)
  assert.ok(below.amount0 > 0n && below.amount1 === 0n)
  assert.ok(above.amount1 > 0n && above.amount0 === 0n)
})

test('encodeMintPosition: pasangan ETH -> value=amount0Max, ada SWEEP, calldata valid', () => {
  const pool = {
    currency0: NATIVE,
    currency1: '0x2222222222222222222222222222222222222222',
    fee: 3000,
    tick_spacing: 60,
    hooks: NATIVE,
  }
  const owner = '0x1111111111111111111111111111111111111111' as const
  const tx = encodeMintPosition({
    pool,
    tickLower: -120,
    tickUpper: 120,
    liquidity: 5_000_000n,
    amount0Max: 10n ** 17n,
    amount1Max: 42n,
    owner,
    deadline: 1_800_000_000n,
  })
  assert.equal(tx.to, ADDRESSES.positionManager)
  assert.equal(tx.value, 10n ** 17n) // ETH ikut msg.value

  const decoded = decodeFunctionData({
    abi: parseAbi(['function modifyLiquidities(bytes unlockData, uint256 deadline) payable']),
    data: tx.data,
  })
  assert.equal(decoded.functionName, 'modifyLiquidities')
  assert.equal(decoded.args[1], 1_800_000_000n)
  const [actions, params] = decodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    decoded.args[0] as `0x${string}`,
  )
  const expected = `0x${[MINT_POSITION, SETTLE_PAIR, SWEEP].map((b) => b.toString(16).padStart(2, '0')).join('')}`
  assert.equal(actions, expected)
  assert.equal((params as string[]).length, 3)
})

test('encodeMintPosition: pasangan non-ETH -> value 0, tanpa SWEEP', () => {
  const pool = {
    currency0: '0x3333333333333333333333333333333333333333',
    currency1: '0x4444444444444444444444444444444444444444',
    fee: 500,
    tick_spacing: 10,
    hooks: NATIVE,
  }
  const tx = encodeMintPosition({
    pool,
    tickLower: -10,
    tickUpper: 10,
    liquidity: 1n,
    amount0Max: 100n,
    amount1Max: 100n,
    owner: '0x1111111111111111111111111111111111111111',
    deadline: 1n,
  })
  assert.equal(tx.value, 0n)
  const decoded = decodeFunctionData({
    abi: parseAbi(['function modifyLiquidities(bytes unlockData, uint256 deadline) payable']),
    data: tx.data,
  })
  const [actions, params] = decodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    decoded.args[0] as `0x${string}`,
  )
  assert.equal(actions, `0x${[MINT_POSITION, SETTLE_PAIR].map((b) => b.toString(16).padStart(2, '0')).join('')}`)
  assert.equal((params as string[]).length, 2)
})
