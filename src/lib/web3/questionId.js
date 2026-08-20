import { keccak256, encodeAbiParameters, toBytes } from 'viem'

/** Canonical questionId used by createMarket, MatchCard, and market detail. */
export function matchQuestionId(startggEventId, startggSetId) {
  return questionIdFromOutcomeRef(startggEventId, 0, `set:${startggSetId}`)
}

export function tournamentWinnerQuestionId(startggEventId, entrantName) {
  return questionIdFromOutcomeRef(startggEventId, 1, String(entrantName))
}

export function questionIdFromOutcomeRef(startggEventId, marketType, outcomeRef) {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint8' }, { type: 'bytes32' }],
      [BigInt(startggEventId || 0), Number(marketType), keccak256(toBytes(String(outcomeRef)))],
    ),
  )
}
