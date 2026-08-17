// Result repository: the only place that calls the result-command Edge
// Function, which validates the request shape and forwards to
// submit_official_result (0011_result_rpc.sql) — the sole authority for
// official results. See tournament-operations spec "Official result
// authority".
import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('tournaments', 'El servicio de resultados no está disponible ahora mismo.')
}

/**
 * @param {string} requestId
 * @param {string} matchId
 * @param {number} gamesWonA
 * @param {number} gamesWonB
 * @returns {Promise<{status: 'accepted'|'invalid_score'|'not_completable', resultId?: string, winnerMembershipId?: string}>}
 */
export async function submitOfficialResult(requestId, matchId, gamesWonA, gamesWonB) {
  assertConfigured()
  const { data, error } = await supabase.functions.invoke('result-command', {
    method: 'POST',
    body: { requestId, matchId, gamesWonA, gamesWonB },
  })

  if (error) {
    const body = typeof error.context?.json === 'function' ? await safeJson(error.context) : null
    throw toAppError(body ?? { error: { code: 'UNAVAILABLE', message: error.message, requestId } })
  }

  return data
}

async function safeJson(response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

/**
 * Authorized correction of an existing official result — the sole path
 * that revises a result after submission. Calls correct_result
 * (0013_correction_rpc.sql) directly (same pattern as
 * tournamentRepository's lifecycle/registration RPC calls): organizer/
 * referee/admin-only, requires a non-empty reason, and never mutates the
 * original evidence — it appends a new version instead. See
 * rating-projections spec "Correction and historical auditability".
 * @param {string} requestId
 * @param {string} resultId
 * @param {number} expectedVersion
 * @param {number} gamesWonA
 * @param {number} gamesWonB
 * @param {string} reason
 * @returns {Promise<{status: 'corrected'|'invalid_score'|'version_conflict'|'reason_required', resultId?: string, version?: number}>}
 */
export async function correctResult(requestId, resultId, expectedVersion, gamesWonA, gamesWonB, reason) {
  assertConfigured()
  const { data, error } = await supabase.rpc('correct_result', {
    p_request_id: requestId,
    p_result_id: resultId,
    p_expected_version: expectedVersion,
    p_games_won_a: gamesWonA,
    p_games_won_b: gamesWonB,
    p_reason: reason,
  })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message, requestId } })
  return data
}
