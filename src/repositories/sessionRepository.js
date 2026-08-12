// Session repository: the only place that talks to Supabase Auth and the
// bootstrap-session Edge Function. See authenticated-identity spec
// "Google authentication and session lifecycle" and design.md sequence
// diagram (Browser->SupabaseAuth: Google OAuth ->
// SessionProvider->bootstrap-session: JWT).
import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('identity', 'El servicio de autenticación no está disponible ahora mismo.')
}

/**
 * Starts the Google OAuth redirect flow. Resolves once the redirect has
 * been initiated (the browser navigates away); the actual session lands
 * back through onAuthStateChange after the provider redirect returns.
 */
export async function signInWithGoogle() {
  assertConfigured()
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })
  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
}

export async function signOut() {
  assertConfigured()
  const { error } = await supabase.auth.signOut()
  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
}

/** Returns the current Supabase session, or null if there isn't one. */
export async function getCurrentSession() {
  assertConfigured()
  const { data, error } = await supabase.auth.getSession()
  if (error) throw toAppError({ error: { code: 'UNAVAILABLE', message: error.message } })
  return data.session ?? null
}

/**
 * Subscribes to auth state changes (SIGNED_IN, SIGNED_OUT,
 * TOKEN_REFRESHED, etc). Returns an unsubscribe function.
 */
export function onAuthStateChange(callback) {
  assertConfigured()
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => callback(event, session))
  return () => subscription.unsubscribe()
}

/**
 * Calls the bootstrap-session Edge Function with the current session's
 * JWT: idempotent profile upsert, returns { profile, roles }.
 */
export async function bootstrapSession() {
  assertConfigured()
  const { data, error } = await supabase.functions.invoke('bootstrap-session', { method: 'POST' })

  if (error) {
    const body = typeof error.context?.json === 'function' ? await safeJson(error.context) : null
    throw toAppError(body ?? { error: { code: 'UNAVAILABLE', message: error.message } })
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
