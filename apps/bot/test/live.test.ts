import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tokenIdFromLogs } from '../src/modules/executor/live.ts'

const PM = '0x58daec3116aae6d93017baaea7749052e8a04fa7'
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const ZERO = '0x' + '0'.repeat(64)
const addrTopic = (a: string) => '0x' + a.slice(2).padStart(64, '0')
const idTopic = (n: bigint) => '0x' + n.toString(16).padStart(64, '0')

test('tokenIdFromLogs: ambil tokenId dari Transfer mint (from=0) PositionManager', () => {
  const logs = [
    // log lain (swap dsb) — diabaikan
    { address: '0xdeadbeef00000000000000000000000000000000', topics: [TRANSFER, ZERO, addrTopic('0xabc'), idTopic(9n)] },
    // mint: from=0, to=owner, id=4242
    { address: PM, topics: [TRANSFER, ZERO, addrTopic('0x1111111111111111111111111111111111111111'), idTopic(4242n)] },
  ]
  assert.equal(tokenIdFromLogs(logs, PM), 4242n)
})

test('tokenIdFromLogs: transfer BUKAN mint (from != 0) diabaikan', () => {
  const logs = [
    { address: PM, topics: [TRANSFER, addrTopic('0x1111111111111111111111111111111111111111'), addrTopic('0xabc'), idTopic(7n)] },
  ]
  assert.equal(tokenIdFromLogs(logs, PM), null)
})

test('tokenIdFromLogs: transfer dari kontrak lain diabaikan', () => {
  const logs = [
    { address: '0x9999999999999999999999999999999999999999', topics: [TRANSFER, ZERO, addrTopic('0xabc'), idTopic(1n)] },
  ]
  assert.equal(tokenIdFromLogs(logs, PM), null)
})

test('tokenIdFromLogs: tanpa log relevan -> null', () => {
  assert.equal(tokenIdFromLogs([], PM), null)
})
