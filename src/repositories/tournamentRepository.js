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
// See tournament-operations spec "Validated tournament lifecycle" /
// "Registration and roster freeze".
import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('tournaments', 'El servicio de torneos no está disponible ahora mismo.')
}

const TOURNAMENT_FIELDS =
  'id, organizer_id, game_id, format_id, name, status, version, roster_frozen_at, created_at, updated_at'

/** Lists tournaments visible to the current caller (published, plus the organizer's own drafts). */
export async function listTournaments() {
  assertConfigured()
  const { data, error } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_FIELDS)
    .order('created_at', { ascending: false })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? []
}

/** Reads one tournament visible to the current caller, or null if not found/not visible. */
export async function getTournament(id) {
  assertConfigured()
  const { data, error } = await supabase.from('tournaments').select(TOURNAMENT_FIELDS).eq('id', id).maybeSingle()

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
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
