import { encodeAbiParameters, encodeFunctionData, parseAbi } from 'viem'
import { ADDRESSES } from '../../config/index.ts'

/**
 * Encode tutup posisi LP v4: BURN_POSITION (0x03) -> TAKE_PAIR (0x11).
 * BURN_POSITION menarik seluruh liquidity + fee lalu burn NFT; TAKE_PAIR
 * mengirim kedua currency ke recipient. Butuh tokenId dari mint sebelumnya.
 */
export const BURN_POSITION = 0x03
export const TAKE_PAIR = 0x11

const pmAbi = parseAbi([
  'function modifyLiquidities(bytes unlockData, uint256 deadline) payable',
])

export type BurnArgs = {
  tokenId: bigint
  amount0Min: bigint
  amount1Min: bigint
  currency0: `0x${string}`
  currency1: `0x${string}`
  recipient: `0x${string}`
  deadline: bigint
}

export function encodeBurnPosition(a: BurnArgs): { to: `0x${string}`; data: `0x${string}`; value: bigint } {
  const burnParam = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'bytes' }],
    [a.tokenId, a.amount0Min, a.amount1Min, '0x'],
  )
  const takeParam = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
    [a.currency0, a.currency1, a.recipient],
  )
  const actions = `0x${[BURN_POSITION, TAKE_PAIR].map((b) => b.toString(16).padStart(2, '0')).join('')}` as const
  const unlockData = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [actions, [burnParam, takeParam]],
  )
  const data = encodeFunctionData({
    abi: pmAbi,
    functionName: 'modifyLiquidities',
    args: [unlockData, a.deadline],
  })
  return { to: ADDRESSES.positionManager, data, value: 0n }
}
