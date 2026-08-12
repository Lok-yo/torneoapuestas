// RED (then GREEN against ../projector.js): proves an accepted official
// result deterministically produces exactly two versioned rating events
// (winner/loser), that draft/simulated/non-official input produces none,
// that repeated projection of the same result is equivalent (idempotent
// shape), and that a version mismatch between the caller's expected state
// and the current result is marked for review rather than silently
// resolved. See tasks.md 4.1/4.3 and rating-projections spec
// "Official-result rating events" / "Deterministic and retry-safe
// processing". This is the client-testable mirror of
// project_rating_event() (0012_rating_projector_trigger.sql), the real
// server-side authority.
import { describe, it, expect } from 'vitest'
import { projectRatingEvents, resolveCorrectionOutcome, RatingProjectionError, WIN_DELTA, LOSE_DELTA } from '../projector.js'

const officialResult = {
  id: 'r1',
  status: 'OFFICIAL',
  winnerMembershipId: 'membership-a',
  rulesetVersion: 1,
  version: 1,
}

const match = {
  participantAMembershipId: 'membership-a',
  participantBMembershipId: 'membership-b',
}

describe('rating projection from an official result', () => {
  it('produces a versioned winner event and a versioned loser event linked to the source result', () => {
    const events = projectRatingEvents({ result: officialResult, match })

    expect(events).toHaveLength(2)
    const winnerEvent = events.find((e) => e.participantMembershipId === 'membership-a')
    const loserEvent = events.find((e) => e.participantMembershipId === 'membership-b')

    expect(winnerEvent).toMatchObject({
      resultId: 'r1',
      delta: WIN_DELTA,
      rulesetVersion: 1,
      version: 1,
      reviewState: 'CLEAN',
    })
    expect(loserEvent).toMatchObject({
      resultId: 'r1',
      delta: LOSE_DELTA,
      rulesetVersion: 1,
      version: 1,
      reviewState: 'CLEAN',
    })
  })

  it.each([
    ['a draft result', { ...officialResult, status: 'DRAFT' }],
    ['a simulated/forecast result', { ...officialResult, status: 'SIMULATED' }],
    ['a null result', null],
  ])('produces no rating event for %s (unofficial/invalid input)', (_label, badResult) => {
    expect(projectRatingEvents({ result: badResult, match })).toEqual([])
  })

  it('throws for a result whose winner is not one of the match participants', () => {
    expect(() =>
      projectRatingEvents({ result: { ...officialResult, winnerMembershipId: 'membership-zzz' }, match }),
    ).toThrow(RatingProjectionError)
  })

  it('throws when the match is missing a filled participant slot', () => {
    expect(() =>
      projectRatingEvents({ result: officialResult, match: { participantAMembershipId: 'membership-a', participantBMembershipId: null } }),
    ).toThrow(RatingProjectionError)
  })

  it('repeated processing of the same result produces one equivalent event pair (deterministic/idempotent shape)', () => {
    const first = projectRatingEvents({ result: officialResult, match })
    const second = projectRatingEvents({ result: officialResult, match })
    expect(second).toEqual(first)
  })
})

describe('correction version-conflict detection', () => {
  it('marks the projection for review when the caller expected a stale version, preserving evidence (no silent resolution)', () => {
    const outcome = resolveCorrectionOutcome({ expectedVersion: 1, currentVersion: 2 })
    expect(outcome).toEqual({ status: 'version_conflict', reviewState: 'NEEDS_REVIEW' })
  })

  it('proceeds cleanly when the expected version matches the current version', () => {
    const outcome = resolveCorrectionOutcome({ expectedVersion: 2, currentVersion: 2 })
    expect(outcome).toEqual({ status: 'ok', reviewState: 'CLEAN' })
  })
})
