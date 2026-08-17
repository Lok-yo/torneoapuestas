// Official-result authority and best-of-N score-schema validation. This
// is the client-testable mirror of the same checks submit_official_result
// (0011_result_rpc.sql) enforces server-side as the real authority — a
// client-side "hasAuthority: true" here is never itself a grant, only an
// echo of the caller's role for a faster, friendlier UI error before the
// server-authoritative rejection. See tournament-operations spec
// "Official result authority".

export class ResultError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'ResultError'
    this.code = code
  }
}

/**
 * @param {{ match: { status: string }, hasAuthority: boolean, gamesWonA: number, gamesWonB: number, bestOf: number }} args
 * @returns {{ winnerSide: 'A'|'B' }}
 */
export function validateOfficialResult({ match, hasAuthority, gamesWonA, gamesWonB, bestOf }) {
  if (!hasAuthority) {
    throw new ResultError('FORBIDDEN', 'Only an authorized organizer or referee may submit an official result.')
  }
  if (!match || match.status !== 'READY') {
    throw new ResultError('NOT_COMPLETABLE', 'This match is not in a completable state.')
  }

  const winsNeeded = Math.floor(bestOf / 2) + 1 // first-to-N for a best-of-(2N-1) series

  const validScore =
    Number.isInteger(gamesWonA) &&
    Number.isInteger(gamesWonB) &&
    gamesWonA >= 0 &&
    gamesWonB >= 0 &&
    gamesWonA + gamesWonB <= bestOf &&
    ((gamesWonA === winsNeeded && gamesWonB < winsNeeded) ||
      (gamesWonB === winsNeeded && gamesWonA < winsNeeded))

  if (!validScore) {
    throw new ResultError(
      'INVALID_SCORE',
      `Score must reach exactly ${winsNeeded} wins for one side under a best-of-${bestOf} schema.`,
    )
  }

  return { winnerSide: gamesWonA === winsNeeded ? 'A' : 'B' }
}
