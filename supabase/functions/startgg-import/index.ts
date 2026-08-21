// startgg-import: authenticated add-by-link boundary. The caller JWT is
// validated before the function resolves start.gg metadata with the server
// token. Tournament ingestion uses the service role; the tracking RPC is
// invoked with the caller-scoped client so submitted_by always comes from
// auth.uid(), never from request data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CommandError, toHttpResponse, toUnexpectedErrorResponse } from '../_shared/errors.ts'
import { log, newRequestId } from '../_shared/log.js'
import { parseStartggUrl } from './urlParser.ts'
import { resolveSupportedEvent, type ResolvableEvent } from './resolver.ts'

const STARTGG_GRAPHQL_URL = 'https://api.start.gg/gql/alpha'
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const TOURNAMENT_QUERY = /* GraphQL */ `
  query TournamentForImport($slug: String!) {
    tournament(slug: $slug) {
      id
      name
      events {
        id
        slug
        name
        startAt
        videogame { id }
        phases { id name }
      }
    }
  }
`

const INITIAL_SET_PROBE_QUERY = /* GraphQL */ `
  query InitialSetProbe($phaseId: ID!) {
    phase(id: $phaseId) {
      id
      sets(page: 1, perPage: 1) { nodes { id } }
    }
  }
`

const SQLSTATE_TO_ERROR_CODE: Record<string, CommandError['code']> = {
  '28000': 'UNAUTHENTICATED',
  '22023': 'VALIDATION_ERROR',
  '42501': 'FORBIDDEN',
  P0002: 'NOT_FOUND',
}

interface TournamentResponse {
  tournament?: {
    id: string
    name: string
    events?: ResolvableEvent[]
  }
}

interface GraphQLSuccess {
  ok: true
  data: unknown
}

interface GraphQLFailure {
  ok: false
  status: number
  message?: string
}

async function startggGraphQL(
  query: string,
  variables: Record<string, unknown>,
  token: string,
): Promise<GraphQLSuccess | GraphQLFailure> {
  const response = await fetch(STARTGG_GRAPHQL_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })

  let body: { data?: unknown; errors?: Array<{ message?: string }> } = {}
  try {
    body = await response.json()
  } catch {
    // Keep the upstream status as the only detail exposed to logs.
  }

  if (!response.ok || body.errors?.length) {
    return { ok: false, status: response.status || 502, message: body.errors?.[0]?.message }
  }
  return { ok: true, data: body.data }
}

async function deterministicUuid(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)))
  const hex = Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

async function probeInitialSets(event: ResolvableEvent, token: string): Promise<void> {
  const phases = Array.isArray(event.phases) ? event.phases : event.phases?.nodes ?? []
  const phase = phases[0]
  if (!phase) return
  const result = await startggGraphQL(INITIAL_SET_PROBE_QUERY, { phaseId: phase.id }, token)
  if (!result.ok) throw new Error(`initial set fetch failed (${result.status})`)
}

Deno.serve(async (req) => {
  const requestId = newRequestId()

  if (req.method === 'OPTIONS') return withCors(new Response(null, { status: 204 }))
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
  if (typeof body !== 'object' || body === null || typeof (body as Record<string, unknown>).url !== 'string') {
    return withCors(toHttpResponse(new CommandError('VALIDATION_ERROR', 'url must be a string.', requestId)))
  }

  const parsedUrl = parseStartggUrl((body as { url: string }).url)
  if (!parsedUrl) {
    return withCors(toHttpResponse(new CommandError('VALIDATION_ERROR', 'Use a valid start.gg tournament or event URL.', requestId)))
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const startggToken = Deno.env.get('STARTGG_API_TOKEN')
  const shadowOrganizerId = Deno.env.get('STARTGG_SHADOW_ORGANIZER_ID')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !startggToken || !shadowOrganizerId) {
    log.error({ requestId, event: 'startgg_import.misconfigured' })
    return withCors(toUnexpectedErrorResponse(requestId))
  }

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  try {
    const { data: userData, error: userError } = await callerClient.auth.getUser()
    if (userError || !userData?.user) {
      return withCors(toHttpResponse(new CommandError('UNAUTHENTICATED', 'Session is invalid or expired.', requestId)))
    }

    const tournamentResult = await startggGraphQL(TOURNAMENT_QUERY, { slug: parsedUrl.tournamentSlug }, startggToken)
    if (!tournamentResult.ok) {
      log.warn({ requestId, event: 'startgg_import.tournament_resolve_failed', status: tournamentResult.status })
      return withCors(toHttpResponse(new CommandError('UNAVAILABLE', 'start.gg could not be reached.', requestId)))
    }

    const tournament = (tournamentResult.data as TournamentResponse)?.tournament
    const resolved = resolveSupportedEvent(tournament?.events, parsedUrl.eventSlug)
    if (!tournament || !resolved) {
      return withCors(toHttpResponse(new CommandError('UNPROCESSABLE', 'No supported event was found for this URL.', requestId)))
    }

    const eventId = Number(resolved.event.id)
    if (!Number.isSafeInteger(eventId) || eventId <= 0) {
      return withCors(toHttpResponse(new CommandError('UNPROCESSABLE', 'start.gg returned an invalid event identifier.', requestId)))
    }

    const { data: existing, error: existingError } = await serviceClient
      .from('tournaments')
      .select('id')
      .eq('startgg_event_id', eventId)
      .maybeSingle()
    if (existingError) throw existingError

    const tournamentId = existing?.id ?? await deterministicUuid(`startgg-event:${eventId}`)
    const { error: upsertError } = await serviceClient.from('tournaments').upsert(
      {
        id: tournamentId,
        organizer_id: shadowOrganizerId,
        game_id: resolved.mapping.game_id,
        format_id: resolved.mapping.format_id,
        name: `${tournament.name} — ${resolved.event.name}`,
        status: 'IN_PROGRESS',
        startgg_event_id: eventId,
        ...(resolved.event.slug ? { startgg_slug: resolved.event.slug } : {}),
      },
      { onConflict: 'id' },
    )
    if (upsertError) throw upsertError

    const { data: tracking, error: trackingError } = await callerClient.rpc('add_tournament_by_link', {
      p_startgg_event_id: eventId,
      p_tournament_id: tournamentId,
    })
    if (trackingError) {
      const code = SQLSTATE_TO_ERROR_CODE[trackingError.code ?? ''] ?? 'UNAVAILABLE'
      return withCors(toHttpResponse(new CommandError(code, trackingError.message, requestId)))
    }

    try {
      await probeInitialSets(resolved.event, startggToken)
    } catch (error) {
      // Tracking already committed. The poller can backfill sets later, so
      // expose a recoverable partial result instead of rolling back tracking.
      log.warn({ requestId, event: 'startgg_import.partial_import', eventId, message: String(error) })
      return withCors(
        new Response(JSON.stringify({ status: tracking?.status ?? 'tracked', tournamentId, eventId, partialImport: true }), {
          status: 207,
          headers: { 'content-type': 'application/json' },
        }),
      )
    }

    return withCors(
      new Response(JSON.stringify({ ...tracking, tournamentId, eventId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  } catch (error) {
    log.error({ requestId, event: 'startgg_import.unexpected_error', message: String(error) })
    return withCors(toUnexpectedErrorResponse(requestId))
  }
})

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value)
  return new Response(response.body, { status: response.status, headers })
}
