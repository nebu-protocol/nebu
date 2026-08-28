import { encodeAbiParameters, encodeFunctionData, parseAbi } from 'viem'
import { ADDRESSES, NATIVE } from '../../config/index.ts'
import type { PoolRef } from './types.ts'

/**
 * Encoder calldata PancakeSwap Infinity (CLAMM). Aksi & pola IDENTIK Uniswap v4
 * (periphery yang sama) — satu-satunya beda: struct PoolKey punya 6 field
 * (currency0, currency1, hooks, poolManager, fee, parameters) vs 5 di v4, dan
 * target = CLPositionManager / Universal Router. parameters = tickSpacing<<16
 * (no-hook; strategi kita memang requireNoHook). Pure — diuji.
 */

// Aksi liquidity/swap (byte sama persis dgn v4 Actions)
const CL_MINT_POSITION = 0x02
const CL_BURN_POSITION = 0x03
const CL_SWAP_EXACT_IN_SINGLE = 0x06
const SETTLE_ALL = 0x0c
const SETTLE_PAIR = 0x0d
const TAKE_ALL = 0x0f
const TAKE_PAIR = 0x11
const SWEEP = 0x14
const COMMAND_INFI_SWAP = '0x10' // Universal Router: INFI_SWAP

const clpmAbi = parseAbi(['function modifyLiquidities(bytes unlockData, uint256 deadline) payable'])
const urAbi = parseAbi(['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'])

/** Komponen PoolKey Infinity (urutan menentukan poolId = keccak dari 6 field). */
const poolKeyComponents = [
  { name: 'currency0', type: 'address' },
  { name: 'currency1', type: 'address' },
  { name: 'hooks', type: 'address' },
  { name: 'poolManager', type: 'address' },
  { name: 'fee', type: 'uint24' },
  { name: 'parameters', type: 'bytes32' },
] as const

/** bytes32 parameters untuk pool no-hook: tickSpacing di bit [16,40). */
export function encodeParameters(tickSpacing: number): `0x${string}` {
  return `0x${(BigInt(tickSpacing) << 16n).toString(16).padStart(64, '0')}` as `0x${string}`
}

/**
 * parameters PoolKey final: pakai raw bytes32 tersimpan (mengandung hook-perms) kalau ada
 * (WAJIB utk pool ber-hook), else derive dari tickSpacing (no-hook). Salah parameters =
 * poolId salah = tx revert.
 */
export function resolveParameters(pool: PoolRef): `0x${string}` {
  const p = pool.parameters
  if (p && /^0x[0-9a-fA-F]{64}$/.test(p)) return p as `0x${string}`
  return encodeParameters(pool.tick_spacing)
}

function poolKeyStruct(pool: PoolRef) {
  return {
    currency0: pool.currency0 as `0x${string}`,
    currency1: pool.currency1 as `0x${string}`,
    hooks: pool.hooks as `0x${string}`,
    poolManager: ADDRESSES.clPoolManager,
    fee: pool.fee,
    parameters: resolveParameters(pool),
  }
}

const toActions = (bytes: number[]) =>
  `0x${bytes.map((b) => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`

export type Encoded = { to: `0x${string}`; data: `0x${string}`; value: bigint }

/** CL_MINT_POSITION -> SETTLE_PAIR -> [SWEEP jika native]. value = amount0Max (native). */
export function encodeInfinityMint(a: {
  pool: PoolRef
  tickLower: number
  tickUpper: number
  liquidity: bigint
  amount0Max: bigint
  amount1Max: bigint
  owner: `0x${string}`
  deadline: bigint
}): Encoded {
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
    [poolKeyStruct(a.pool), a.tickLower, a.tickUpper, a.liquidity, a.amount0Max, a.amount1Max, a.owner, '0x'],
  )
  const settleParam = encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [c0, c1])
  const actionBytes = [CL_MINT_POSITION, SETTLE_PAIR]
  const params = [mintParam, settleParam]
  if (nativeIn) {
    actionBytes.push(SWEEP)
    params.push(encodeAbiParameters([{ type: 'address' }, { type: 'address' }], [NATIVE, a.owner]))
  }
  const unlockData = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [toActions(actionBytes), params],
  )
  const data = encodeFunctionData({ abi: clpmAbi, functionName: 'modifyLiquidities', args: [unlockData, a.deadline] })
  return { to: ADDRESSES.clPositionManager, data, value: nativeIn ? a.amount0Max : 0n }
}

/** CL_BURN_POSITION -> TAKE_PAIR (kirim kedua currency ke recipient). */
export function encodeInfinityBurn(a: {
  tokenId: bigint
  amount0Min: bigint
  amount1Min: bigint
  currency0: `0x${string}`
  currency1: `0x${string}`
  recipient: `0x${string}`
  deadline: bigint
}): Encoded {
  const burnParam = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'bytes' }],
    [a.tokenId, a.amount0Min, a.amount1Min, '0x'],
  )
  const takeParam = encodeAbiParameters(
    [{ type: 'address' }, { type: 'address' }, { type: 'address' }],
    [a.currency0, a.currency1, a.recipient],
  )
  const unlockData = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [toActions([CL_BURN_POSITION, TAKE_PAIR]), [burnParam, takeParam]],
  )
  const data = encodeFunctionData({ abi: clpmAbi, functionName: 'modifyLiquidities', args: [unlockData, a.deadline] })
  return { to: ADDRESSES.clPositionManager, data, value: 0n }
}

/** INFI_SWAP: CL_SWAP_EXACT_IN_SINGLE token1 -> native (currency0). value = 0. */
export function encodeInfinitySwapToNative(a: {
  pool: PoolRef
  amountInWei: bigint
  minOutWei: bigint
  deadline: bigint
}): Encoded {
  const c0 = a.pool.currency0 as `0x${string}`
  const c1 = a.pool.currency1 as `0x${string}`
  const swapParam = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: poolKeyComponents },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [
      {
        poolKey: poolKeyStruct(a.pool),
        zeroForOne: false, // token1 -> token0 (native)
        amountIn: a.amountInWei,
        amountOutMinimum: a.minOutWei,
        hookData: '0x',
      },
    ],
  )
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [c1, a.amountInWei])
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [c0, a.minOutWei])
  const payload = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [toActions([CL_SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]), [swapParam, settle, take]],
  )
  const data = encodeFunctionData({
    abi: urAbi,
    functionName: 'execute',
    args: [COMMAND_INFI_SWAP, [payload], a.deadline],
  })
  return { to: ADDRESSES.universalRouter, data, value: 0n }
}

/** INFI_SWAP: CL_SWAP_EXACT_IN_SINGLE native (currency0) -> token1. value = amountIn (native). */
export function encodeInfinitySwapFromNative(a: {
  pool: PoolRef
  amountInWei: bigint
  minOutWei: bigint
  deadline: bigint
}): Encoded {
  const c0 = a.pool.currency0 as `0x${string}`
  const c1 = a.pool.currency1 as `0x${string}`
  const swapParam = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'poolKey', type: 'tuple', components: poolKeyComponents },
          { name: 'zeroForOne', type: 'bool' },
          { name: 'amountIn', type: 'uint128' },
          { name: 'amountOutMinimum', type: 'uint128' },
          { name: 'hookData', type: 'bytes' },
        ],
      },
    ],
    [
      {
        poolKey: poolKeyStruct(a.pool),
        zeroForOne: true, // token0(native) -> token1
        amountIn: a.amountInWei,
        amountOutMinimum: a.minOutWei,
        hookData: '0x',
      },
    ],
  )
  const settle = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [c0, a.amountInWei])
  const take = encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [c1, a.minOutWei])
  const payload = encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes[]' }],
    [toActions([CL_SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]), [swapParam, settle, take]],
  )
  const data = encodeFunctionData({
    abi: urAbi,
    functionName: 'execute',
    args: [COMMAND_INFI_SWAP, [payload], a.deadline],
  })
  return { to: ADDRESSES.universalRouter, data, value: a.amountInWei }
}
