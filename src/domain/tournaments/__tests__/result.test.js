// RED (then GREEN against src/domain/tournaments/result.js): proves
// official-result authority, the best-of-3 games_won_a/games_won_b score
// schema, and stale/repeat rejection. See tasks.md 3.10 and
// tournament-operations spec "Official result authority". This is the
// client-testable mirror of the same checks submit_official_result
// (0011_result_rpc.sql) enforces server-side as the real authority — the
// database grant, not this module, is what actually stops an unauthorized
// caller.
import { describe, it, expect } from 'vitest'
import { validateOfficialResult, ResultError } from '../result.js'

const readyMatch = { status: 'READY' }
const completedMatch = { status: 'COMPLETED' }
const pendingMatch = { status: 'PENDING' }

describe('official result authority and score schema (best_of = 3)', () => {
  it('accepts a valid 2-0 result from an authorized caller on a completable match', () => {
    const result = validateOfficialResult({
      match: readyMatch,
      hasAuthority: true,
      gamesWonA: 2,
      gamesWonB: 0,
      bestOf: 3,
    })
    expect(result.winnerSide).toBe('A')
  })

  it('accepts a valid 2-1 result', () => {
    const result = validateOfficialResult({
      match: readyMatch,
      hasAuthority: true,
      gamesWonA: 1,
      gamesWonB: 2,
      bestOf: 3,
    })
    expect(result.winnerSide).toBe('B')
  })

  it('rejects an unauthorized caller regardless of a well-formed score', () => {
    expect(() =>
      validateOfficialResult({ match: readyMatch, hasAuthority: false, gamesWonA: 2, gamesWonB: 0, bestOf: 3 }),
    ).toThrow(ResultError)
  })

  it('rejects a match that is not completable (still pending, both slots not filled)', () => {
    expect(() =>
      validateOfficialResult({ match: pendingMatch, hasAuthority: true, gamesWonA: 2, gamesWonB: 0, bestOf: 3 }),
    ).toThrow(ResultError)
  })

  it('rejects a repeated/stale submission for an already-completed match', () => {
    expect(() =>
      validateOfficialResult({ match: completedMatch, hasAuthority: true, gamesWonA: 2, gamesWonB: 0, bestOf: 3 }),
    ).toThrow(ResultError)
  })

  it.each([
    [2, 2],
    [0, 0],
    [3, 0],
    [1, 1],
    [-1, 2],
  ])('rejects an invalid best-of-3 score %i-%i', (gamesWonA, gamesWonB) => {
    expect(() =>
      validateOfficialResult({ match: readyMatch, hasAuthority: true, gamesWonA, gamesWonB, bestOf: 3 }),
    ).toThrow(ResultError)
  })
})
