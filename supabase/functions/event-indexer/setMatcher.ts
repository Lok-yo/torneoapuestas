// Pure candidate-hash matching for event-indexer: keccak is one-way, so
// a MarketCreated questionId cannot be reversed back to its start.gg set
// id — instead we recompute the candidate questionId for every set of
// the event and match (design.md "Identity", tasks.md 2.5). Split out
// from index.ts so it can be unit-tested with `deno test` without a
// live RPC or Supabase dependency.

import { keccak256, encodeAbiParameters } from 'https://esm.sh/viem@2?bundle'

/** `keccak256(UTF8("set:<setId>"))` — the on-chain outcome hash for a
 * set market (design.md "Question ID and Resolution Contract"). */
export function outcomeHashForSet(setId: number | string): `0x${string}` {
  return keccak256(new TextEncoder().encode(`set:${setId}`))
}

/** `keccak256(abi.encode(eventId, marketType, outcomeHash))` — mirrors
 * MarketFactory.createMarket's questionId derivation exactly. */
export function questionIdForSet(eventId: number, marketType: number, setId: number | string): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint8' }, { type: 'bytes32' }],
      [BigInt(eventId), marketType, outcomeHashForSet(setId)],
    ),
  )
}

/**
 * Finds the start.gg set id whose candidate questionId equals the
 * MarketCreated event's questionId. Returns null when no candidate
 * matches (e.g. marketType=1 tournament-winner markets, whose
 * outcomeRef is "tournament-winner" — they legitimately stay unmapped).
 */
export function matchStartggSetId(
  questionId: string,
  eventId: number,
  marketType: number,
  setIds: Array<number | string>,
): number | string | null {
  const needle = questionId.toLowerCase()
  for (const setId of setIds) {
    if (questionIdForSet(eventId, marketType, setId).toLowerCase() === needle) return setId
  }
  return null
}