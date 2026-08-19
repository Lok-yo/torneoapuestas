// Tournament repository: tournament reads plus the registration/
// withdrawal/lifecycle commands, all through RLS-scoped Supabase calls
// and the transactional RPCs that own those writes (register_participant,
// withdraw_participant, advance_tournament_state — see 0008/0009_*.sql).
// Reads go straight to the `tournaments` base table: 0004_rls_policies.sql
// already scopes it the way this repository needs (anyone reads published
// tournaments; the organizer additionally reads their own drafts), so no
// separate view is needed here — unlike bracket/match/result reads, which
// go through public_brackets_view specifically to keep private membership
// identities out of an unauthenticated response (see bracketRepository.js).
//
// TOP-8 bracket reads (listTournamentSets, getSetById) query the
// public_tournament_sets_view defined in 0025_tournament_sets_and_market_set_key.sql.
// The base table tournament_sets is service-role-only (RLS on, no client
// grants), so all client reads go through the allowlisted view that hides
// phase_id, raw entrant/winner IDs, and cache internals.
//
// See tournament-operations spec "Validated tournament lifecycle" /
// "Registration and roster freeze".
import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('tournaments', 'El servicio de torneos no está disponible ahora mismo.')
}

const TOURNAMENT_FIELDS =
  'id, organizer_id, game_id, format_id, name, status, version, roster_frozen_at, startgg_event_id, created_at, updated_at'
const TOURNAMENT_FIELDS_FALLBACK =
  'id, organizer_id, game_id, format_id, name, status, version, roster_frozen_at, created_at, updated_at'

function isMissingColumnError(error, column) {
  const msg = String(error?.message ?? '')
  return msg.includes(column) && msg.includes('does not exist')
}

/** Column allowlist for the public tournament_sets view (0025). */
const TOURNAMENT_SET_FIELDS =
  'startgg_set_id, tournament_id, startgg_event_id, phase_name, round, slot, state, entrant_a_name, entrant_b_name, event_starts_at, started_at, completed_at, updated_at, winner_name, has_market, market_question_id'

/** Lists tournaments visible to the current caller (published, plus the organizer's own drafts). */
export async function listTournaments() {
  assertConfigured()
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_FIELDS)
    .order('created_at', { ascending: false })

  if (error) {
    if (isMissingColumnError(error, 'startgg_event_id')) {
      const retry = await supabase.from('tournaments').select(TOURNAMENT_FIELDS_FALLBACK).order('created_at', { ascending: false })
      if (retry.error) throw toAppError({ error: { code: 'UNAVAILABLE', message: retry.error.message } })
      return retry.data ?? []
    }
    throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  }
  return data ?? []
}

/** Reads one tournament visible to the current caller, or null if not found/not visible. */
export async function getTournament(id) {
  assertConfigured()
  const { data, error } = await supabase.from('tournaments').select(TOURNAMENT_FIELDS).eq('id', id).maybeSingle()

  if (error) {
    if (isMissingColumnError(error, 'startgg_event_id')) {
      const retry = await supabase.from('tournaments').select(TOURNAMENT_FIELDS_FALLBACK).eq('id', id).maybeSingle()
      if (retry.error) throw toAppError({ error: { code: 'UNAVAILABLE', message: retry.error.message } })
      return retry.data ?? null
    }
    throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  }
  return data ?? null
}

/** Reads the format's ruleset (public read-only catalog data). */
export async function getTournamentFormat(formatId) {
  assertConfigured()
  const { data, error } = await supabase
    .from('tournament_formats')
    .select('id, game_id, name, roster_size, best_of, ruleset, ruleset_version')
    .eq('id', formatId)
    .maybeSingle()

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? null
}

/** Reads the current session user's own membership for a tournament, or null. */
export async function getOwnMembership(tournamentId, userId) {
  assertConfigured()
  const { data, error } = await supabase
    .from('memberships')
    .select('id, status, seed')
    .eq('tournament_id', tournamentId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? null
}

/**
 * @returns {Promise<{status: 'registered'|'already_registered'|'closed'|'roster_full'}>}
 */
export async function registerParticipant(requestId, tournamentId) {
  assertConfigured()
  const { data, error } = await supabase.rpc('register_participant', {
    p_request_id: requestId,
    p_tournament_id: tournamentId,
  })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message, requestId } })
  return data
}

/**
 * @returns {Promise<{status: 'withdrawn'|'not_registered'|'frozen'}>}
 */
export async function withdrawParticipant(requestId, tournamentId) {
  assertConfigured()
  const { data, error } = await supabase.rpc('withdraw_participant', {
    p_request_id: requestId,
    p_tournament_id: tournamentId,
  })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message, requestId } })
  return data
}

/**
 * @returns {Promise<{status: 'transitioned'|'invalid_transition'|'version_conflict', newStatus?: string, version?: number}>}
 */
export async function advanceTournamentState(requestId, tournamentId, action, expectedVersion) {
  assertConfigured()
  const { data, error } = await supabase.rpc('advance_tournament_state', {
    p_request_id: requestId,
    p_tournament_id: tournamentId,
    p_action: action,
    p_expected_version: expectedVersion,
  })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message, requestId } })
  return data
}

/**
 * @returns {Promise<{status: 'created', tournamentId: string, name: string, organizerId: string, gameId: string, formatId: string, tournamentStatus: string}>}
 */
export async function createTournament(
  requestId,
  name,
  gameId = 'ssbu',
  formatId = '00000000-0000-0000-0000-000000000001',
) {
  assertConfigured()
  const { data, error } = await supabase.rpc('create_tournament', {
    p_request_id: requestId,
    p_name: name,
    p_game_id: gameId,
    p_format_id: formatId,
  })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message, requestId } })
  return data
}

/**
 * @returns {Promise<{status: 'granted', role: 'organizer'}>}
 */
export async function claimOrganizerRole() {
  assertConfigured()
  const { data, error } = await supabase.rpc('claim_organizer_role')
  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data
}

/**
 * Searches tournaments by name or game_id, returning only those linked
 * to a start.gg event. Used by the Create-Market combobox.
 * @param {string} query – free-text search term
 * @returns {Promise<Array<object>>} up to 10 results
 */
export async function searchTournaments(query) {
  assertConfigured()
  if (!query || query.trim().length < 2) return []

  const escaped = query.replace(/[,%.()]/g, (c) => `\\${c}`)
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_FIELDS)
    .not('startgg_event_id', 'is', null)
    .or(`name.ilike.%${escaped}%,game_id.ilike.%${escaped}%`)
    .order('name')
    .limit(10)

  if (error) {
    if (isMissingColumnError(error, 'startgg_event_id')) {
      const retry = await supabase
        .from('tournaments')
        .select(TOURNAMENT_FIELDS_FALLBACK)
        .or(`name.ilike.%${escaped}%,game_id.ilike.%${escaped}%`)
        .order('name')
        .limit(10)
      if (retry.error) throw toAppError({ error: { code: 'UNAVAILABLE', message: retry.error.message } })
      return retry.data ?? []
    }
    throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  }
  return data ?? []
}

/**
 * Checks whether an active market already exists for a given start.gg
 * event ID, to prevent duplicates at creation time.
 * @deprecated Use checkDuplicateMarketBySetId for TOP-8 set markets.
 *   This function checks by event ID and uses the legacy market_state
 *   column (integer enum); new code should scope dedup by set.
 * @param {number} startggEventId
 * @returns {Promise<boolean>} true if a duplicate exists
 */
export async function checkDuplicateMarket(startggEventId) {
  assertConfigured()
  const { count, error } = await supabase
    .from('onchain_markets')
    .select('id', { count: 'exact', head: true })
    .eq('startgg_event_id', startggEventId)
    .eq('market_state', 3)

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return (count ?? 0) > 0
}

// -----------------------------------------------------------------
// TOP-8 set reads (0025_tournament_sets_and_market_set_key.sql)
// -----------------------------------------------------------------

/**
 * Lists all TOP-8 bracket sets for a tournament, ordered by round then slot.
 * Reads from the public view (no sensitive internals exposed).
 * @param {string} tournamentId
 * @returns {Promise<Array<object>>}
 */
export async function listTournamentSets(tournamentId) {
  assertConfigured()
  const { data, error } = await supabase
    .from('public_tournament_sets_view')
    .select(TOURNAMENT_SET_FIELDS)
    .eq('tournament_id', tournamentId)
    .order('round')
    .order('slot')

  if (error) {
    if (String(error.message ?? '').includes('does not exist')) return []
    throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  }
  return data ?? []
}

/**
 * Reads a single TOP-8 set by its start.gg set ID.
 * @param {number} startggSetId
 * @returns {Promise<object|null>}
 */
export async function getSetById(startggSetId) {
  assertConfigured()
  const { data, error } = await supabase
    .from('public_tournament_sets_view')
    .select(TOURNAMENT_SET_FIELDS)
    .eq('startgg_set_id', startggSetId)
    .maybeSingle()

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? null
}

/**
 * Checks whether a live market (PENDING/CHALLENGED/ACTIVE) already exists
 * for a given start.gg set ID. This replaces the legacy checkDuplicateMarket
 * for TOP-8 markets by scoping dedup to the set instead of the event.
 * @param {number} startggSetId
 * @returns {Promise<boolean>} true if a duplicate exists
 */
export async function checkDuplicateMarketBySetId(startggSetId) {
  assertConfigured()
  const { count, error } = await supabase
    .from('onchain_markets')
    .select('id', { count: 'exact', head: true })
    .eq('startgg_set_id', startggSetId)
    .in('state', ['PENDING', 'CHALLENGED', 'ACTIVE'])

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return (count ?? 0) > 0
}

