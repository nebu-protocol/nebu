import { encodeAbiParameters, encodeFunctionData, parseAbi } from 'viem'
import { ADDRESSES, NATIVE } from '../../config/index.ts'

/**
 * Encode mint posisi LP v4 via PositionManager.modifyLiquidities.
 * unlockData = abi.encode(actions, params[]) dengan aksi:
 *   MINT_POSITION (0x02) -> SETTLE_PAIR (0x0d) -> [SWEEP (0x14) jika ada ETH native].
 * SWEEP mengembalikan sisa ETH ke owner (mint tidak selalu pakai seluruh msg.value).
 */
export const MINT_POSITION = 0x02
export const SETTLE_PAIR = 0x0d
export const SWEEP = 0x14

export type PoolKeyLike = {
  currency0: string
  currency1: string
  fee: number
  tick_spacing: number
  hooks: string
}

const pmAbi = parseAbi([
  'function modifyLiquidities(bytes unlockData, uint256 deadline) payable',
])

const poolKeyComponents = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'tickSpacing', type: 'int24' },
  { name: 'hooks', type: 'address' },
] as const

export type MintArgs = {
  pool: PoolKeyLike
  tickLower: number
  tickUpper: number
  liquidity: bigint
  amount0Max: bigint
  amount1Max: bigint
  owner: `0x${string}`
  deadline: bigint
}

export function encodeMintPosition(a: MintArgs): {
  to: `0x${string}`
  data: `0x${string}`
  value: bigint
} {
  const c0 = a.pool.currency0 as `0x${string}`
  const c1 = a.pool.currency1 as `0x${string}`
  const nativeIn = c0 === NATIVE

  const mintParam = encodeAbiParameters(
    [
      { type: 'tuple', components: poolKeyComponents },
      { type: 'int24' },
      { type: 'int24' },
      { type: 'uint256' },
      { type: 'uint128' },
      { type: 'uint128' },
      { type: 'address' },
      { type: 'bytes' },
    ],
    [
      {
        currency0: c0,
        currency1: c1,
        fee: a.pool.fee,
        tickSpacing: a.pool.tick_spacing,
        hooks: a.pool.hooks as `0x${string}`,
      },
      a.tickLower,
      a.tickUpper,
      a.liquidity,
      a.amount0Max,
      a.amount1Max,
      a.owner,
      '0x',
    ],
  )
  const settleParam = encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [c0, c1])

  const actionBytes = [MINT_POSITION, SETTLE_PAIR]
  const params = [mintParam, settleParam]
  if (nativeIn) {
    actionBytes.push(SWEEP)
    params.push(encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [NATIVE, a.owner]))
  }
  const actions = `0x${actionBytes.map((b) => b.toString(16).padStart(2, '0')).join('')}` as const

  const unlockData = encodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], [actions, params])
  const data = encodeFunctionData({
    abi: pmAbi,
    functionName: 'modifyLiquidities',
    args: [unlockData, a.deadline],
  })
  return { to: ADDRESSES.positionManager, data, value: nativeIn ? a.amount0Max : 0n }
}
