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

function clearPersistedAuth() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('sb-') && key.includes('auth-token')) {
        localStorage.removeItem(key)
      }
    }
    localStorage.removeItem('torneoapuestas-session')
  } catch {
    // private mode / storage blocked
  }
}

export async function signOut() {
  // Always drop the browser session first. `scope: 'global'` (the
  // supabase-js default) talks to the Auth API; if that call fails or
  // hangs, the JWT stays in localStorage and the next TOKEN_REFRESHED
  // puts the user right back in.
  if (supabase) {
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // fall through to manual storage wipe
    }
    try {
      await supabase.auth.signOut({ scope: 'global' })
    } catch {
      // already signed out locally
    }
  }
  clearPersistedAuth()
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
 *
 * Must never throw: SessionProvider calls this from a layout effect, and
 * React 19 unmounts the whole tree on an uncaught effect error — which
 * leaves a blank (black) screen because body is #07080b. If identity is
 * disabled or Supabase is not configured, return a no-op unsubscribe
 * and let the rest of the SPA render in an anonymous/unavailable state.
 */
export function onAuthStateChange(callback) {
  try {
    assertConfigured()
  } catch {
    return () => {}
  }
  if (!supabase) return () => {}
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
