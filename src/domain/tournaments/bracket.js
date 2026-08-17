// Deterministic single-elimination bracket seeding for the approved
// 8-participant SSBU format. Standard tournament seeding (1v8, 4v5, 3v6,
// 2v7) keeps top seeds apart as long as possible; this is a pure function
// of the input seed order, so the same roster always produces the same
// bracket regardless of how many times it runs — the invariant that
// makes generate_bracket (0010_bracket_rpc.sql) safe under retries and
// concurrent calls. See tasks.md 3.7/3.8 and tournament-operations spec
// "Bracket and match invariants".

const APPROVED_ROSTER_SIZE = 8

export class BracketError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BracketError'
  }
}

// Round-1 pairing indices into the seed array (0-indexed), in bracket order.
const ROUND_1_PAIRS = [
  [0, 7], // seed 1 vs seed 8
  [3, 4], // seed 4 vs seed 5
  [2, 5], // seed 3 vs seed 6
  [1, 6], // seed 2 vs seed 7
]

/**
 * @param {string[]} seeds - ordered participant identifiers (seed 1 first)
 * @returns {Array<{round:number, slot:number, participantA:string|null, participantB:string|null, nextMatchRound:number|null, nextMatchSlot:'A'|'B'|null}>}
 */
export function generateBracketPlan(seeds) {
  if (!Array.isArray(seeds) || seeds.length !== APPROVED_ROSTER_SIZE) {
    throw new BracketError(`Bracket generation requires exactly ${APPROVED_ROSTER_SIZE} seeded participants.`)
  }

  const round1 = ROUND_1_PAIRS.map(([a, b], slot) => ({
    round: 1,
    slot,
    participantA: seeds[a],
    participantB: seeds[b],
    nextMatchRound: 2,
    nextMatchSlot: /** @type {'A'|'B'} */ (slot % 2 === 0 ? 'A' : 'B'),
  }))

  const round2 = [0, 1].map((slot) => ({
    round: 2,
    slot,
    participantA: null,
    participantB: null,
    nextMatchRound: 3,
    nextMatchSlot: /** @type {'A'|'B'} */ (slot === 0 ? 'A' : 'B'),
  }))

  const round3 = [
    {
      round: 3,
      slot: 0,
      participantA: null,
      participantB: null,
      nextMatchRound: null,
      nextMatchSlot: null,
    },
  ]

  return [...round1, ...round2, ...round3]
}
