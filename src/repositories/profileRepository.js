// Profile repository: reads/writes the authenticated user's own profile
// through RLS-scoped Supabase calls and the claim_username RPC. See
// authenticated-identity spec "Atomic case-insensitive username claim".
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { AppError, toAppError } from '../lib/errors.js'

// Maps the Postgres SQLSTATE codes raised by claim_username's own
// boundary checks (see 0006_username_claim.sql) to the shared AppError
// code enum. Business outcomes (claimed/conflict/rate_limited) never
// reach here — those come back as a normal RPC result, not an error.
const SQLSTATE_TO_ERROR_CODE = {
  28000: 'UNAUTHENTICATED',
  22023: 'VALIDATION_ERROR',
}

function assertConfigured() {
  if (!isSupabaseConfigured) {
    throw new AppError('UNAVAILABLE', 'El servicio de perfiles no está disponible ahora mismo.')
  }
}

/**
 * Atomically and idempotently claims a username for the current session.
 * @param {string} requestId - stable per-attempt UUID; retries with the
 *   same requestId return the original outcome.
 * @param {string} username
 * @returns {Promise<{ status: 'claimed'|'conflict'|'rate_limited', username?: string, usernameNormalized?: string }>}
 */
export async function claimUsername(requestId, username) {
  assertConfigured()
  const { data, error } = await supabase.rpc('claim_username', {
    p_request_id: requestId,
    p_username: username,
  })

  if (error) {
    const code = SQLSTATE_TO_ERROR_CODE[error.code] ?? 'UNAVAILABLE'
    throw toAppError({ error: { code, message: error.message, requestId } })
  }

  return data
}

/** Reads the current user's own profile (owner-only via RLS). */
export async function getOwnProfile(userId) {
  assertConfigured()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, username, display_name, avatar_url, created_at')
    .eq('user_id', userId)
    .single()

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data
}

/** Reads a public profile projection by username (public allowlisted view). */
export async function getPublicPlayerHistory(username) {
  assertConfigured()
  const { data, error } = await supabase
    .from('public_player_history_view')
    .select('*')
    .eq('username', username)

  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data ?? []
}
