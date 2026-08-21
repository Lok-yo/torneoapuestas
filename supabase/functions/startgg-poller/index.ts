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
import { computeBackoffUntil, CycleBudget, isBackingOff, laneForCycle } from './backoff.ts'
import { allSetsCompleted, pickPhase } from './phase.ts'
import { buildSetRow, isPreviewSet, nextSlot, processSet } from './sets.ts'
import { buildUnionWork, UnionWorkItem } from './union.ts'

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
  slug?: string | null
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
          slug
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

const EVENT_BY_ID_QUERY = /* GraphQL */ `
  query EventById($id: ID!) {
    event(id: $id) {
      id
      name
      slug
      startAt
      videogame { id }
      tournament {
        id
        name
        countryCode
      }
      phases {
        id
        name
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

interface IngestResult {
  ingestedSets: number
  skipped: boolean
  unsupportedGame: boolean
}

/** Ingests one event: game-mapping check, tournament upsert, TOP-8 phase
 * pick, paginated set fetch/upsert, and completion status flip. Shared
 * by the tracked mini-cycle and the MX loop so both paths ingest
 * identically — no drift between "how a tracked event is ingested" and
 * "how an MX event is ingested". */
async function ingestEvent(params: {
  // deno-lint-ignore no-explicit-any
  supabase: any
  startggToken: string
  budget: CycleBudget
  requestId: string
  // deno-lint-ignore no-explicit-any
  event: any
  tournamentName: string
}): Promise<IngestResult> {
  const { supabase, startggToken, budget, requestId, event, tournamentName } = params

  const gameId = event.videogame?.id
  const mapping = gameId != null ? STARTGG_GAME_TO_GG_GAME[gameId] : undefined
  if (!mapping) {
    log.info({ requestId, event: 'startgg_poller.unsupported_game', eventId: event.id, videogameId: gameId, tournamentName })
    return { ingestedSets: 0, skipped: false, unsupportedGame: true }
  }

  const tournamentId = await deterministicUuid(`startgg-event:${event.id}`)
  await supabase.from('tournaments').upsert(
    {
      id: tournamentId,
      organizer_id: Deno.env.get('STARTGG_SHADOW_ORGANIZER_ID'),
      game_id: mapping.game_id,
      format_id: mapping.format_id,
      name: `${tournamentName} — ${event.name}`,
      status: 'IN_PROGRESS',
      ...(event.id ? { startgg_event_id: Number(event.id) } : {}),
      ...(event.slug ? { startgg_slug: event.slug } : {}),
    },
    { onConflict: 'id', ignoreDuplicates: false },
  )

  const phases = Array.isArray(event.phases) ? event.phases : event.phases?.nodes ?? []
  const phase = pickPhase(phases)
  if (!phase) {
    log.info({ requestId, event: 'startgg_poller.phase_skipped', eventId: event.id })
    return { ingestedSets: 0, skipped: true, unsupportedGame: false }
  }

  const phaseSets = await fetchPhaseSets(startggToken, phase.id, budget, requestId)
  const eventSets: StartggSet[] = []
  const roundCounters = new Map<number, number>()
  let hasSetIngestError = false
  let ingestedSets = 0

  for (const set of phaseSets) {
    if (isPreviewSet(set.id)) continue // unseeded future-round placeholder — nothing real to ingest yet
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
      eventSets.push(set)
      ingestedSets++
    } catch (err) {
      hasSetIngestError = true
      log.error({ requestId, event: 'startgg_poller.set_ingest_failed', setId: set.id, message: String(err) })
    }
  }

  if (!hasSetIngestError && eventSets.length > 0 && allSetsCompleted(eventSets)) {
    await supabase.from('tournaments').update({ status: 'COMPLETED' }).eq('id', tournamentId)

    // Mueve a finalizados automáticamente si es un torneo trackeado
    await supabase.from('tracked_tournaments').update({ list: 'finalizados' }).eq('tournament_id', tournamentId)
  }

  return { ingestedSets, skipped: false, unsupportedGame: false }
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

  const { data: trackedRows } = await supabase.from('tracked_tournaments').select('startgg_event_id')
  const trackedEventIds = (trackedRows ?? []).map((r) => Number(r.startgg_event_id))

  const deferred: UnionWorkItem[] = []
  const trackedProcessedIds = new Set<number>()

  let ingestedSets = 0
  let skippedEvents = 0
  let unsupportedGames = 0
  let mxProcessed = 0

  try {
    // --- Tracked mini-cycle: always runs first, independent of MX volume,
    // so a manually-tracked tournament's ingestion never depends on
    // whether the 60+ tournament MX cycle finishes before the Edge
    // Function's ~150s wall-clock timeout (design.md "Polling budget"). ---
    for (const eventId of trackedEventIds) {
      if (budget.remaining < 2) {
        deferred.push({ event_id: eventId, source: 'tracked', needsEventFetch: true })
        continue
      }
      if (!budget.tryConsume(1)) {
        deferred.push({ event_id: eventId, source: 'tracked', needsEventFetch: true })
        continue
      }
      const res = await startggGraphQL(EVENT_BY_ID_QUERY, { id: String(eventId) }, startggToken)
      if (!res.ok) {
        if (res.status === 429) throw new RateLimitError(res.retryAfterSeconds)
        log.error({ requestId, event: 'startgg_poller.tracked_event_fetch_failed', eventId })
        continue
      }
      // deno-lint-ignore no-explicit-any
      const event = (res.data as any)?.event
      if (!event) continue
      const tournamentName = event.tournament?.name || 'Torneo Manual'

      const ingestResult = await ingestEvent({ supabase, startggToken, budget, requestId, event, tournamentName })
      ingestedSets += ingestResult.ingestedSets
      if (ingestResult.skipped) skippedEvents++
      if (ingestResult.unsupportedGame) unsupportedGames++
      trackedProcessedIds.add(eventId)
    }

    // --- MX cycle: runs after tracked is already committed, so a
    // timeout or upstream failure here never costs a tracked event. ---
    budget.tryConsume(1)
    const result = await startggGraphQL(MX_TOURNAMENTS_QUERY, { perPage: 25 }, startggToken)

    let tournaments: StartggTournament[] = []
    if (!result.ok) {
      if (result.status === 429) throw new RateLimitError(result.retryAfterSeconds)
      // Tracked is already ingested at this point — an MX-only failure
      // degrades this cycle's MX coverage, it doesn't fail the request.
      log.error({ requestId, event: 'startgg_poller.mx_query_failed', status: result.status })
    } else {
      tournaments = ((result.data as { tournaments?: { nodes?: StartggTournament[] } })?.tournaments?.nodes ?? []).filter(
        (t) => t.countryCode === 'MX', // belt-and-suspenders: server-side filter already applied, re-checked here (spec "Non-MX tournament excluded")
      )
    }

    const mxEvents = tournaments
      .flatMap((t) => (t.events ?? []).map((e) => ({ startgg_event_id: Number(e.id), tournament: t, event: e })))
      .filter((e) => !trackedProcessedIds.has(e.startgg_event_id)) // already ingested above; avoid redundant re-ingestion

    // trackedEvents passed empty: tracked was already handled by the mini-cycle,
    // so every remaining item here is MX-only (never needsEventFetch).
    const unionWork = buildUnionWork(mxEvents, [])

    for (const workItem of unionWork) {
      if (budget.remaining < 1) {
        deferred.push(workItem)
        continue
      }
      const mxMatch = mxEvents.find((e) => e.startgg_event_id === workItem.event_id)
      if (!mxMatch) continue

      const ingestResult = await ingestEvent({
        supabase,
        startggToken,
        budget,
        requestId,
        event: mxMatch.event,
        tournamentName: mxMatch.tournament.name,
      })
      mxProcessed++
      ingestedSets += ingestResult.ingestedSets
      if (ingestResult.skipped) skippedEvents++
      if (ingestResult.unsupportedGame) unsupportedGames++
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

  if (deferred.length > 0) {
    for (const item of deferred) {
      await supabase.rpc('upsert_startgg_deferred_work', {
        p_startgg_event_id: item.event_id,
        p_source: item.source,
      })
    }
  }

  await supabase.from('startgg_ingestion_cursor').upsert({
    source_key: SOURCE_KEY,
    last_polled_at: new Date().toISOString(),
    last_completed_at: new Date().toISOString(),
    backoff_until: null,
    cycle_requests: budget.remaining >= 0 ? 60 - budget.remaining : 60,
  })

  const processed = trackedProcessedIds.size + mxProcessed

  log.info({
    requestId,
    event: 'startgg_poller.cycle_complete',
    trackedProcessed: trackedProcessedIds.size,
    mxProcessed,
    processed,
    deferred: deferred.length,
    skippedEvents,
    unsupportedGames,
    ingestedSets,
  })

  return new Response(
    JSON.stringify({ status: 'ok', trackedProcessed: trackedProcessedIds.size, mxProcessed, processed, deferred: deferred.length, skippedEvents, unsupportedGames, ingestedSets }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
})