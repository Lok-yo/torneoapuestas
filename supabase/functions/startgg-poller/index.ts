// startgg-poller: MX-filtered start.gg polling worker. Cron-invoked
// (recommended: pg_cron + pg_net `net.http_post` on a 60s schedule, or
// Supabase's dashboard-configured scheduled Edge Function trigger —
// deploy-time concern, not implemented in this file). Writes directly
// into `public.tournament_sets` as the service role (no human organizer
// session exists for ingested tournaments); it no longer writes
// matches/results nor creates shadow users — those belonged to the
// legacy bracket model, which the TOP-8 set-betting redesign replaces
// (design.md "Poller and Data Flow", tasks.md 2.1–2.3).
//
// Flow per cycle: one MX tournaments query carrying each event's
// phases → per event, pick the TOP-8 phase (exact match, then
// final/elimination/bracket/playoff fallback) → paginated phase sets →
// idempotent upsert of every set (future, in-progress, and completed)
// into tournament_sets. See design.md "Polling budget (~80 req/60s)"
// and phase.ts/sets.ts (unit-tested separately, phase.test.ts /
// sets.test.ts / tasks.md 2.4).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { log, newRequestId } from '../_shared/log.js'
import { computeBackoffUntil, CycleBudget, isBackingOff, laneForCycle, partitionByBudget } from './backoff.ts'
import { pickPhase } from './phase.ts'
import { buildSetRow, nextSlot, processSet } from './sets.ts'

const STARTGG_GRAPHQL_URL = 'https://api.start.gg/gql/alpha'
const SOURCE_KEY = 'startgg-mx-poller'
const SETS_PER_PAGE = 25
const MAX_SET_PAGES = 8 // 200 sets max per phase — far beyond any TOP-8 bracket

interface StartggSet {
  id: string
  round: number
  state: number // start.gg numeric state; 3 = COMPLETED, 2 = IN_PROGRESS
  startedAt: number | null
  completedAt: number | null
  winnerId: string | null
  slots: Array<{ entrant: { id: string; name: string } | null }>
}

interface StartggPhase {
  id: string
  name: string
}

interface StartggVideogame {
  id: number
}

interface StartggEvent {
  id: string
  startAt: number | null
  videogame?: StartggVideogame
  phases?: { nodes: StartggPhase[] }
}

interface StartggTournament {
  id: string
  name: string
  countryCode: string | null
  events: StartggEvent[]
}

interface PhaseSetsResponse {
  phase?: { id: string; name: string; sets?: { nodes: StartggSet[] } }
}

class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds?: number) {
    super('start.gg rate limited')
    this.name = 'RateLimitError'
  }
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
        events {
          id
          name
          startAt
          videogame { id }
          phases {
            id
            name
          }
        }
      }
    }
  }
`

// start.gg videogame.id → { game_id, format_id } for tournament_formats (migration 0026)
const STARTGG_GAME_TO_GG_GAME: Record<number, { game_id: string; format_id: string }> = {
  1386: { game_id: 'ssbu', format_id: '00000000-0000-0000-0000-000000000001' },
  1: { game_id: 'melee', format_id: '00000000-0000-0000-0000-000000000002' },
  43868: { game_id: 'sf6', format_id: '00000000-0000-0000-0000-000000000003' },
  62790: { game_id: 'fatal-fury', format_id: '00000000-0000-0000-0000-000000000004' },
  49783: { game_id: 'tekken8', format_id: '00000000-0000-0000-0000-000000000005' },
  53945: { game_id: 'roa2', format_id: '00000000-0000-0000-0000-000000000006' },
}

const PHASE_SETS_QUERY = /* GraphQL */ `
  query PhaseSets($phaseId: ID!, $page: Int!, $perPage: Int!) {
    phase(id: $phaseId) {
      id
      name
      sets(page: $page, perPage: $perPage, sortType: STANDARD) {
        nodes {
          id
          round
          state
          startedAt
          completedAt
          winnerId
          slots {
            entrant { id name }
          }
        }
      }
    }
  }
`

/** Fetches all sets of one phase with bounded pagination, consuming one
 * request-budget slot per page. Stops early on an upstream error (keeps
 * the rest of the cycle) and throws RateLimitError on a 429 so the
 * cycle persists backoff instead of hammering the API. */
async function fetchPhaseSets(
  startggToken: string,
  phaseId: string,
  budget: CycleBudget,
  requestId: string,
): Promise<StartggSet[]> {
  const sets: StartggSet[] = []
  for (let page = 1; page <= MAX_SET_PAGES; page++) {
    if (!budget.tryConsume(1)) {
      log.info({ requestId, event: 'startgg_poller.budget_exhausted', phaseId, page })
      break
    }
    const result = await startggGraphQL(PHASE_SETS_QUERY, { phaseId, page, perPage: SETS_PER_PAGE }, startggToken)
    if (!result.ok) {
      if (result.status === 429) throw new RateLimitError(result.retryAfterSeconds)
      log.error({ requestId, event: 'startgg_poller.phase_sets_error', phaseId, status: result.status })
      break
    }
    const nodes = ((result.data as PhaseSetsResponse)?.phase?.sets?.nodes) ?? []
    sets.push(...nodes)
    if (nodes.length < SETS_PER_PAGE) break
  }
  return sets
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
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
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
  let skippedEvents = 0
  let unsupportedGames = 0
  try {
    for (const tournament of processed) {
      for (const event of tournament.events ?? []) {
        const gameId = event.videogame?.id
        const mapping = gameId != null ? STARTGG_GAME_TO_GG_GAME[gameId] : undefined

        if (!mapping) {
          unsupportedGames++
          log.info({ requestId, event: 'startgg_poller.unsupported_game', eventId: event.id, videogameId: gameId, tournamentName: tournament.name })
          continue
        }

        const tournamentId = await deterministicUuid(`startgg-event:${event.id}`)
        await supabase.from('tournaments').upsert(
          {
            id: tournamentId,
            organizer_id: Deno.env.get('STARTGG_SHADOW_ORGANIZER_ID'),
            game_id: mapping.game_id,
            format_id: mapping.format_id,
            name: `${tournament.name} — ${event.name}`,
            status: 'IN_PROGRESS',
            ...(event.id ? { startgg_event_id: Number(event.id) } : {}),
          },
          { onConflict: 'id', ignoreDuplicates: false },
        )
        const phases = Array.isArray((event as unknown as { phases: unknown }).phases)
          ? (event as unknown as { phases: StartggPhase[] }).phases
          : (event as unknown as { phases: { nodes: StartggPhase[] } }).phases?.nodes ?? []
        const phase = pickPhase(phases)
        if (!phase) {
          skippedEvents++
          log.info({ requestId, event: 'startgg_poller.phase_skipped', eventId: event.id })
          continue
        }

        const phaseSets = await fetchPhaseSets(startggToken, phase.id, budget, requestId)
        const roundCounters = new Map<number, number>()
        for (const set of phaseSets) {
          try {
            const row = buildSetRow({
              tournamentId,
              eventId: Number(event.id),
              phaseId: Number(phase.id),
              phaseName: phase.name,
              eventStartsAt: event.startAt,
              set,
              slot: nextSlot(roundCounters, set.round),
            })
            await processSet(supabase, row)
            ingestedSets++
          } catch (err) {
            log.error({ requestId, event: 'startgg_poller.set_ingest_failed', setId: set.id, message: String(err) })
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof RateLimitError) {
      const backoffUntil = computeBackoffUntil({ isRateLimited: true, retryAfterSeconds: err.retryAfterSeconds })
      await supabase.from('startgg_ingestion_cursor').upsert({
        source_key: SOURCE_KEY,
        last_polled_at: new Date().toISOString(),
        last_completed_at: cursor.last_completed_at,
        backoff_until: backoffUntil?.toISOString() ?? null,
        cycle_requests: 0,
      })
      log.warn({ requestId, event: 'startgg_poller.rate_limited_mid_cycle', backoffUntil: backoffUntil?.toISOString() })
      return new Response(JSON.stringify({ status: 'rate_limited', backoffUntil: backoffUntil?.toISOString() }), { status: 200 })
    }
    log.error({ requestId, event: 'startgg_poller.cycle_failed', message: String(err) })
    return new Response(JSON.stringify({ error: 'UNAVAILABLE' }), { status: 503 })
  }

  await supabase.from('startgg_ingestion_cursor').upsert({
    source_key: SOURCE_KEY,
    last_polled_at: new Date().toISOString(),
    last_completed_at: new Date().toISOString(),
    backoff_until: null,
    cycle_requests: budget.remaining >= 0 ? 60 - budget.remaining : 60,
  })

  log.info({
    requestId,
    event: 'startgg_poller.cycle_complete',
    processed: processed.length,
    deferred: deferred.length,
    skippedEvents,
    unsupportedGames,
    ingestedSets,
  })

  return new Response(
    JSON.stringify({ status: 'ok', processed: processed.length, deferred: deferred.length, skippedEvents, unsupportedGames, ingestedSets }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
})