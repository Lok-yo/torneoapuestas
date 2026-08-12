// bootstrap-session: validates the caller's Supabase Auth JWT, performs
// an idempotent profile upsert (never overwrites an existing username),
// and returns the profile plus the caller's role grants. See
// authenticated-identity spec "Google authentication and session
// lifecycle" / "Private profile with public allowlist" and design.md
// sequence diagram (SessionProvider->bootstrap-session: JWT ->
// bootstrap-session->Postgres: idempotent profile upsert).
//
// This function never trusts a client-supplied role claim: it forwards
// the caller's own JWT to Postgres so every read/write runs under that
// user's RLS-scoped identity (see design.md "Browser writes vs commands").

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CommandError, toHttpResponse, toUnexpectedErrorResponse } from '../_shared/errors.ts'
import { log, newRequestId } from '../_shared/log.js'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  const requestId = newRequestId()

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    const err = new CommandError('VALIDATION_ERROR', 'Only POST is supported.', requestId)
    return withCors(toHttpResponse(err))
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    const err = new CommandError('UNAUTHENTICATED', 'Missing Authorization header.', requestId)
    return withCors(toHttpResponse(err))
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    log.error({ requestId, event: 'bootstrap_session.misconfigured' })
    return withCors(toUnexpectedErrorResponse(requestId))
  }

  // Forward the caller's own JWT — every downstream query runs as this
  // user, so RLS (not this function) is the authority on what it can see
  // or change.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()

    if (userError || !userData?.user) {
      log.warn({ requestId, event: 'bootstrap_session.invalid_token' })
      const err = new CommandError('UNAUTHENTICATED', 'Session is invalid or expired.', requestId)
      return withCors(toHttpResponse(err))
    }

    const userId = userData.user.id

    // Idempotent: only sets user_id on conflict, so an existing
    // username/display_name is never overwritten by a repeated bootstrap.
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({ user_id: userId }, { onConflict: 'user_id' })

    if (upsertError) {
      log.error({ requestId, event: 'bootstrap_session.upsert_failed', code: upsertError.code })
      return withCors(toUnexpectedErrorResponse(requestId))
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('user_id, username, display_name, avatar_url, created_at')
      .eq('user_id', userId)
      .single()

    if (profileError || !profile) {
      log.error({ requestId, event: 'bootstrap_session.profile_read_failed' })
      return withCors(toUnexpectedErrorResponse(requestId))
    }

    const { data: roleRows, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)

    if (roleError) {
      log.error({ requestId, event: 'bootstrap_session.role_read_failed' })
      return withCors(toUnexpectedErrorResponse(requestId))
    }

    const roles = (roleRows ?? []).map((r) => r.role)

    log.info({ requestId, event: 'bootstrap_session.success', userId })

    return withCors(
      new Response(JSON.stringify({ profile, roles }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  } catch (error) {
    log.error({ requestId, event: 'bootstrap_session.unexpected_error', message: String(error) })
    return withCors(toUnexpectedErrorResponse(requestId))
  }
})

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value)
  return new Response(response.body, { status: response.status, headers })
}
