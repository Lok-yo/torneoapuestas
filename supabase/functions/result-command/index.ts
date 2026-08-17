// result-command: validated command boundary for submitting an official
// match result. Forwards the caller's own JWT so Postgres RLS/grants (not
// this function) authorize the write, and delegates the actual score/
// authority/idempotency rules to submit_official_result
// (0011_result_rpc.sql) — this function only validates the request shape
// and maps SQLSTATE codes to the shared structured-error contract. See
// tournament-operations spec "Official result authority" and design.md
// sequence diagram (Organizer/Referee->result-command: requestId+
// expectedVersion+evidence -> result-command->result-RPC: validate
// role/state/score/ruleset).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CommandError, toHttpResponse, toUnexpectedErrorResponse } from '../_shared/errors.ts'
import { log, newRequestId } from '../_shared/log.js'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// SQLSTATE codes raised by submit_official_result's own boundary checks
// (auth/validation/authority/not-found), which happen before any state is
// recorded. Expected business outcomes (accepted/invalid_score/
// not_completable) come back as a normal RPC result, not a Postgres error.
const SQLSTATE_TO_ERROR_CODE: Record<string, CommandError['code']> = {
  '28000': 'UNAUTHENTICATED',
  '22023': 'VALIDATION_ERROR',
  '42501': 'FORBIDDEN',
  P0002: 'NOT_FOUND',
}

Deno.serve(async (req) => {
  const requestId = newRequestId()

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return withCors(toHttpResponse(new CommandError('VALIDATION_ERROR', 'Only POST is supported.', requestId)))
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader) {
    return withCors(toHttpResponse(new CommandError('UNAUTHENTICATED', 'Missing Authorization header.', requestId)))
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return withCors(toHttpResponse(new CommandError('VALIDATION_ERROR', 'Request body must be valid JSON.', requestId)))
  }

  const parsed = parseBody(body)
  if (!parsed.ok) {
    return withCors(toHttpResponse(new CommandError('VALIDATION_ERROR', parsed.message, requestId)))
  }
  const { commandRequestId, matchId, gamesWonA, gamesWonB } = parsed.value

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    log.error({ requestId, event: 'result_command.misconfigured' })
    return withCors(toUnexpectedErrorResponse(requestId))
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  try {
    const { data, error } = await supabase.rpc('submit_official_result', {
      p_request_id: commandRequestId,
      p_match_id: matchId,
      p_games_won_a: gamesWonA,
      p_games_won_b: gamesWonB,
    })

    if (error) {
      const code = SQLSTATE_TO_ERROR_CODE[error.code ?? ''] ?? 'UNAVAILABLE'
      log.warn({ requestId, event: 'result_command.rpc_error', code, pgCode: error.code })
      return withCors(toHttpResponse(new CommandError(code, error.message, requestId)))
    }

    log.info({ requestId, event: 'result_command.success', matchId, status: data?.status })

    return withCors(
      new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  } catch (error) {
    log.error({ requestId, event: 'result_command.unexpected_error', message: String(error) })
    return withCors(toUnexpectedErrorResponse(requestId))
  }
})

function parseBody(
  body: unknown,
):
  | { ok: true; value: { commandRequestId: string; matchId: string; gamesWonA: number; gamesWonB: number } }
  | { ok: false; message: string } {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, message: 'Request body must be an object.' }
  }
  const b = body as Record<string, unknown>

  if (typeof b.requestId !== 'string' || !UUID_PATTERN.test(b.requestId)) {
    return { ok: false, message: 'requestId must be a UUID.' }
  }
  if (typeof b.matchId !== 'string' || !UUID_PATTERN.test(b.matchId)) {
    return { ok: false, message: 'matchId must be a UUID.' }
  }
  if (!Number.isInteger(b.gamesWonA) || !Number.isInteger(b.gamesWonB)) {
    return { ok: false, message: 'gamesWonA and gamesWonB must be integers.' }
  }

  return {
    ok: true,
    value: {
      commandRequestId: b.requestId,
      matchId: b.matchId,
      gamesWonA: b.gamesWonA as number,
      gamesWonB: b.gamesWonB as number,
    },
  }
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value)
  return new Response(response.body, { status: response.status, headers })
}
