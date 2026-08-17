// Client-side mirror of project_rating_event() / resolve_correction_outcome
// logic in 0012_rating_projector_trigger.sql and 0013_correction_rpc.sql —
// pure, deterministic functions that let the UI/tests reason about rating
// projection without a live database. Neither function itself writes
// anything; the Postgres trigger/RPC is the real authority (same "client
// mirror, database enforces" pattern as src/domain/tournaments/result.js).
// See tasks.md 4.1/4.3 and rating-projections spec "Official-result rating
// events" / "Deterministic and retry-safe processing".

export class RatingProjectionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'RatingProjectionError'
    this.code = code
  }
}

// Fixed-magnitude deterministic delta: Stage 1 has no predictions/ELO curve,
// just a simple, auditable win/loss scoring signal tied to the ruleset
// version that produced it. See rating-projections spec "Official-result
// rating events" (each event MUST identify the ruleset/version).
export const WIN_DELTA = 25
export const LOSE_DELTA = -25

/**
 * Projects the (winner, loser) rating events an accepted official result
 * produces. Unofficial/simulated/draft/missing input produces no events at
 * all — ratings MUST change only from accepted official results.
 *
 * @param {{
 *   result: null | { id: string, status: string, winnerMembershipId: string, rulesetVersion: number, version: number },
 *   match: { participantAMembershipId?: string|null, participantBMembershipId?: string|null }
 * }} args
 * @returns {Array<{resultId: string, participantMembershipId: string, delta: number, rulesetVersion: number, version: number, reviewState: 'CLEAN'}>}
 */
export function projectRatingEvents({ result, match }) {
  if (!result || result.status !== 'OFFICIAL') {
    return []
  }

  if (!match?.participantAMembershipId || !match?.participantBMembershipId) {
    throw new RatingProjectionError(
      'INVALID_MATCH',
      'A rating event requires both bracket participant slots to be filled.',
    )
  }

  const { participantAMembershipId, participantBMembershipId } = match

  if (
    result.winnerMembershipId !== participantAMembershipId &&
    result.winnerMembershipId !== participantBMembershipId
  ) {
    throw new RatingProjectionError(
      'INVALID_WINNER',
      'The winning membership must be one of the match participants.',
    )
  }

  const loserMembershipId =
    result.winnerMembershipId === participantAMembershipId ? participantBMembershipId : participantAMembershipId

  return [
    {
      resultId: result.id,
      participantMembershipId: result.winnerMembershipId,
      delta: WIN_DELTA,
      rulesetVersion: result.rulesetVersion,
      version: result.version,
      reviewState: 'CLEAN',
    },
    {
      resultId: result.id,
      participantMembershipId: loserMembershipId,
      delta: LOSE_DELTA,
      rulesetVersion: result.rulesetVersion,
      version: result.version,
      reviewState: 'CLEAN',
    },
  ]
}

/**
 * Mirrors correct_result's optimistic-concurrency check (0013_correction_rpc.sql):
 * a correction whose expected_version no longer matches the current result
 * version is a conflicting source version — it MUST stop for review rather
 * than silently choosing one. See rating-projections spec "Deterministic and
 * retry-safe processing" scenario "Conflicting history".
 *
 * @param {{ expectedVersion: number, currentVersion: number }} args
 * @returns {{ status: 'ok'|'version_conflict', reviewState: 'CLEAN'|'NEEDS_REVIEW' }}
 */
export function resolveCorrectionOutcome({ expectedVersion, currentVersion }) {
  if (expectedVersion !== currentVersion) {
    return { status: 'version_conflict', reviewState: 'NEEDS_REVIEW' }
  }
  return { status: 'ok', reviewState: 'CLEAN' }
}
