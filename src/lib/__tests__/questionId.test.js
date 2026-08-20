import { describe, expect, it } from 'vitest'
import { keccak256, encodeAbiParameters, toBytes } from 'viem'
import { matchQuestionId, questionIdFromOutcomeRef } from '../web3/questionId.js'

describe('questionId', () => {
  it('hashes a per-match set the same way CreateMarket does', () => {
    const eventId = 1692032
    const setId = 99
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: 'uint256' }, { type: 'uint8' }, { type: 'bytes32' }],
        [BigInt(eventId), 0, keccak256(toBytes(`set:${setId}`))],
      ),
    )
    expect(matchQuestionId(eventId, setId)).toBe(expected)
    expect(questionIdFromOutcomeRef(eventId, 0, `set:${setId}`)).toBe(expected)
  })
})
