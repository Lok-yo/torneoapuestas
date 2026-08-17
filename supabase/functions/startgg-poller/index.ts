// startgg-poller: MX-filtered start.gg polling worker. Cron-invoked
// (recommended: pg_cron + pg_net `net.http_post` on a 60s schedule, or
// Supabase's dashboard-configured scheduled Edge Function trigger —
// deploy-time concern, not implemented in this file). Writes directly
// into the existing `results`/`matches` schema as the service role (no
// human organizer session exists for ingested tournaments), so 0012's
// rating-projection trigger and 0018's auto-resolve trigger fire exactly
// as they would for any other write — and 0018 stays a no-op because this
// worker never writes `public.markets` (design.md Decision 5).
//
// See design.md "Polling budget (~80 req/60s)", startgg-tournament-
// ingestion spec, and backoff.ts (unit-tested separately, see
// backoff.test.ts / tasks.md 2.5).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { log, newRequestId } from '../_shared/log.js'
import { computeBackoffUntil, CycleBudget, isBackingOff, laneForCycle, partitionByBudget } from './backoff.ts'

const STARTGG_GRAPHQL_URL = 'https://api.start.gg/gql/alpha'
const SOURCE_KEY = 'startgg-mx-poller'

interface StartggSet {
  id: string
  state: number // start.gg numeric state; 3 = COMPLETED
  completedAt: number | null
  winnerId: string | null
  slots: Array<{ entrant: { id: string; name: string } | null }>
}

interface StartggTournament {
  id: string
  name: string
  countryCode: string | null
  startAt: number | null
  events: Array<{ id: string; sets: { nodes: StartggSet[] }; standings?: { nodes: Array<{ placement: number; entrant: { id: string; name: string } }> } }>
}

async function startggGraphQL(query: string, variables: Record<string, unknown>, token: string): Promise<{ ok: true; data: unknown } | { ok: false; status: number; retryAfterSeconds?: number }> {
  const res = await fetch(STARTGG_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after')
    return { ok: false, status: 429, retryAfterSeconds: retryAfter ? Number(retryAfter) : undefined }
  }
  if (!res.ok) {
    return { ok: false, status: res.status }
  }
  const body = await res.json()
  return { ok: true, data: body?.data }
}

const MX_TOURNAMENTS_QUERY = /* GraphQL */ `
  query MxTournaments($perPage: Int!) {
    tournaments(query: { filter: { countryCode: "MX" }, perPage: $perPage }) {
      nodes {
        id
        name
        countryCode
        startAt
        events {
          id
          sets(page: 1, perPage: 25, sortType: RECENT) {
            nodes {
              id
              state
              completedAt
              winnerId
              slots {
                entrant { id name }
              }
            }
          }
        }
      }
    }
  }
`

/** Idempotent: `get_or_create_startgg_shadow_user` — a service-role RPC
 * that upserts a shadow `auth.users` row + `startgg_entrant_links` row
 * for a start.gg entrant with no GG2 login (design.md Decision 4). */
async function ensureShadowUser(
  supabase: ReturnType<typeof createClient>,
  startggEntrantId: string,
  displayName: string,
): Promise<string> {
  const { data: existing } = await supabase
    .from('startgg_entrant_links')
    .select('user_id')
    .eq('startgg_entrant_id', startggEntrantId)
    .maybeSingle()

  if (existing?.user_id) return existing.user_id as string

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: `startgg-entrant-${startggEntrantId}@shadow.gg2.local`,
    email_confirm: true,
    user_metadata: { startgg_entrant_id: startggEntrantId, shadow: true },
  })
  if (createError || !created?.user) {
    throw new Error(`failed to create shadow user for entrant ${startggEntrantId}: ${createError?.message}`)
  }

  await supabase.from('profiles').insert({ user_id: created.user.id, display_name: displayName })
  await supabase.from('startgg_entrant_links').insert({ startgg_entrant_id: startggEntrantId, user_id: created.user.id })

  return created.user.id
}

async function processCompletedSet(
  supabase: ReturnType<typeof createClient>,
  tournamentId: string,
  set: StartggSet,
): Promise<void> {
  if (set.state !== 3 || !set.winnerId) return // start.gg numeric state 3 = COMPLETED

  const [slotA, slotB] = set.slots
  if (!slotA?.entrant || !slotB?.entrant) return // bye/incomplete slot, skip

  const userA = await ensureShadowUser(supabase, slotA.entrant.id, slotA.entrant.name)
  const userB = await ensureShadowUser(supabase, slotB.entrant.id, slotB.entrant.name)

  // Idempotency: matches/results keyed by a deterministic id derived from
  // the start.gg set id, so a re-poll of an already-ingested set never
  // double-inserts (mirrors event-indexer's (block_number, log_index)
  // upsert idempotency for the same reason).
  const matchId = await deterministicUuid(`startgg-set:${set.id}`)

  const { data: existingMatch } = await supabase.from('matches').select('id').eq('id', matchId).maybeSingle()
  if (existingMatch) return // already ingested

  await supabase.from('matches').insert({
    id: matchId,
    tournament_id: tournamentId,
    round: 1,
    slot: 0,
    status: 'READY',
  })

  const winnerUserId = set.winnerId === slotA.entrant.id ? userA : userB

  await supabase.from('results').insert({
    match_id: matchId,
    games_won_a: set.winnerId === slotA.entrant.id ? 2 : 0,
    games_won_b: set.winnerId === slotB.entrant.id ? 2 : 0,
    winner_membership_id: winnerUserId,
    submitted_by: winnerUserId,
    ruleset_version: 1,
    status: 'OFFICIAL',
    request_id: matchId,
  })
}

async function deterministicUuid(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed)))
  const hex = Array.from(bytes.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

Deno.serve(async (req) => {
  const requestId = newRequestId()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const startggToken = Deno.env.get('STARTGG_API_TOKEN')
  const cronSecret = Deno.env.get('POLLER_CRON_SECRET')

  if (!supabaseUrl || !serviceRoleKey || !startggToken) {
    log.error({ requestId, event: 'startgg_poller.misconfigured' })
    return new Response(JSON.stringify({ error: 'UNAVAILABLE' }), { status: 503 })
  }

  // Cron-secret gate: this function ingests using the service role and
  // must never be reachable by an arbitrary anonymous caller.
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'FORBIDDEN' }), { status: 403 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const { data: cursorRow } = await supabase
    .from('startgg_ingestion_cursor')
    .select('*')
    .eq('source_key', SOURCE_KEY)
    .maybeSingle()

  const cursor = cursorRow ?? { last_polled_at: null, last_completed_at: null, backoff_until: null, cycle_requests: 0 }

  if (isBackingOff({ backoffUntil: cursor.backoff_until })) {
    log.info({ requestId, event: 'startgg_poller.backing_off', backoffUntil: cursor.backoff_until })
    return new Response(JSON.stringify({ status: 'backing_off', backoffUntil: cursor.backoff_until }), { status: 200 })
  }

  const budget = new CycleBudget()
  const cycleIndex = Math.floor(Date.now() / 60_000)
  const lanes = laneForCycle(cycleIndex)
  log.info({ requestId, event: 'startgg_poller.cycle_start', lanes, cycleIndex })

  budget.tryConsume(1)
  const result = await startggGraphQL(MX_TOURNAMENTS_QUERY, { perPage: 25 }, startggToken)

  if (!result.ok) {
    if (result.status === 429) {
      const backoffUntil = computeBackoffUntil({ isRateLimited: true, retryAfterSeconds: result.retryAfterSeconds })
      await supabase.from('startgg_ingestion_cursor').upsert({
        source_key: SOURCE_KEY,
        last_polled_at: new Date().toISOString(),
        last_completed_at: cursor.last_completed_at,
        backoff_until: backoffUntil?.toISOString() ?? null,
        cycle_requests: 0,
      })
      log.warn({ requestId, event: 'startgg_poller.rate_limited', backoffUntil: backoffUntil?.toISOString() })
      return new Response(JSON.stringify({ status: 'rate_limited', backoffUntil: backoffUntil?.toISOString() }), { status: 200 })
    }
    log.error({ requestId, event: 'startgg_poller.upstream_error', status: result.status })
    return new Response(JSON.stringify({ error: 'UNAVAILABLE' }), { status: 503 })
  }

  const tournaments = ((result.data as { tournaments?: { nodes?: StartggTournament[] } })?.tournaments?.nodes ?? []).filter(
    (t) => t.countryCode === 'MX', // belt-and-suspenders: server-side filter already applied, re-checked here (spec "Non-MX tournament excluded")
  )

  const { processed, deferred } = partitionByBudget(tournaments, budget)

  let ingestedSets = 0
  for (const tournament of processed) {
    const tournamentId = await deterministicUuid(`startgg-tournament:${tournament.id}`)
    await supabase.from('tournaments').upsert(
      {
        id: tournamentId,
        organizer_id: Deno.env.get('STARTGG_SHADOW_ORGANIZER_ID'),
        game_id: 'ssbu',
        format_id: '00000000-0000-0000-0000-000000000001',
        name: tournament.name,
        status: 'IN_PROGRESS',
      },
      { onConflict: 'id', ignoreDuplicates: false },
    )

    for (const event of tournament.events ?? []) {
      for (const set of event.sets?.nodes ?? []) {
        try {
          await processCompletedSet(supabase, tournamentId, set)
          ingestedSets++
        } catch (err) {
          log.error({ requestId, event: 'startgg_poller.set_ingest_failed', setId: set.id, message: String(err) })
        }
      }
    }
  }

  await supabase.from('startgg_ingestion_cursor').upsert({
    source_key: SOURCE_KEY,
    last_polled_at: new Date().toISOString(),
    last_completed_at: new Date().toISOString(),
    backoff_until: null,
    cycle_requests: budget.remaining >= 0 ? 60 - budget.remaining : 60,
  })

  log.info({ requestId, event: 'startgg_poller.cycle_complete', processed: processed.length, deferred: deferred.length, ingestedSets })

  return new Response(
    JSON.stringify({ status: 'ok', processed: processed.length, deferred: deferred.length, ingestedSets }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
})
