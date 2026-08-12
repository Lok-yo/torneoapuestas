// Bracket repository: the public bracket/match projection plus the
// generate_bracket command (0010_bracket_rpc.sql). Reads go through
// public_brackets_view (0005_public_views.sql) specifically because it
// joins in only usernames, never raw membership/user identities — see
// tournament-operations spec "Public projection and closed perimeter".
import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('tournaments', 'El servicio de brackets no está disponible ahora mismo.')
}

/** Reads the public bracket projection for a tournament, ordered for display. */
export async function getBracket(tournamentId) {
  assertConfigured()
  const { data, error } = await supabase
    .from('public_brackets_view')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('round', { ascending: true })
    .order('slot', { ascending: true })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? []
}

/**
 * @returns {Promise<{status: 'created'|'already_exists'|'invalid_state'|'incomplete_roster', bracketId?: string}>}
 */
export async function generateBracket(requestId, tournamentId) {
  assertConfigured()
  const { data, error } = await supabase.rpc('generate_bracket', {
    p_request_id: requestId,
    p_tournament_id: tournamentId,
  })

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message, requestId } })
  return data
}
