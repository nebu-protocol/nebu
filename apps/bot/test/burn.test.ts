import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decodeAbiParameters, decodeFunctionData, parseAbi } from 'viem'
import { encodeBurnPosition, BURN_POSITION, TAKE_PAIR } from '../src/modules/executor/burn.ts'
import { ADDRESSES, NATIVE } from '../src/config/index.ts'

const modAbi = parseAbi(['function modifyLiquidities(bytes unlockData, uint256 deadline) payable'])

test('encodeBurnPosition: calldata valid, value 0, aksi BURN+TAKE_PAIR', () => {
  const tx = encodeBurnPosition({
    tokenId: 123n,
    amount0Min: 0n,
    amount1Min: 0n,
    currency0: NATIVE,
    currency1: '0x2222222222222222222222222222222222222222',
    recipient: '0x1111111111111111111111111111111111111111',
    deadline: 1_800_000_000n,
  })
  assert.equal(tx.to, ADDRESSES.positionManager)
  assert.equal(tx.value, 0n) // burn tidak mengirim ETH

  const decoded = decodeFunctionData({ abi: modAbi, data: tx.data })
  assert.equal(decoded.functionName, 'modifyLiquidities')
  assert.equal(decoded.args[1], 1_800_000_000n)
  const [actions, params] = decodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    decoded.args[0] as `0x${string}`,
  )
  assert.equal(actions, `0x${[BURN_POSITION, TAKE_PAIR].map((b) => b.toString(16).padStart(2, '0')).join('')}`)
  assert.equal((params as string[]).length, 2)
})

test('encodeBurnPosition: tokenId ter-encode di param BURN_POSITION', () => {
  const tx = encodeBurnPosition({
    tokenId: 999n,
    amount0Min: 5n,
    amount1Min: 7n,
    currency0: NATIVE,
    currency1: '0x2222222222222222222222222222222222222222',
    recipient: '0x1111111111111111111111111111111111111111',
    deadline: 1n,
  })
  const decoded = decodeFunctionData({ abi: modAbi, data: tx.data })
  const [, params] = decodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    decoded.args[0] as `0x${string}`,
  )
  const [tokenId, a0min, a1min] = decodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'bytes' }],
    (params as `0x${string}`[])[0]!,
  )
  assert.equal(tokenId, 999n)
  assert.equal(a0min, 5n)
  assert.equal(a1min, 7n)
  // deterministik
  assert.deepEqual(tx, encodeBurnPosition({
    tokenId: 999n, amount0Min: 5n, amount1Min: 7n, currency0: NATIVE,
    currency1: '0x2222222222222222222222222222222222222222',
    recipient: '0x1111111111111111111111111111111111111111', deadline: 1n,
  }))
})
