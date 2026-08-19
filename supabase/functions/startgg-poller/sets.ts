// Pure set-row mapping + upsert for startgg-poller, split out from
// index.ts so it can be unit-tested with `deno test` without a live
// Supabase/start.gg dependency. The poller no longer writes
// matches/results or shadow users: TOP-8 sets live in
// public.tournament_sets (0025), preserving API slot order A/B and
// nullable byes (design.md "Poller and Data Flow", tasks.md 2.3).

import { mapStartggState } from './phase.ts'

export interface StartggSlot {
  entrant: { id: string; name: string } | null
}

/** Minimal start.gg set node shape this module needs. */
export interface StartggSet {
  id: string
  round: number
  state: number
  startedAt: number | null
  completedAt: number | null
  winnerId: string | null
  slots: StartggSlot[]
}

/** The exact row shape written to public.tournament_sets. */
export interface TournamentSetRow {
  startgg_set_id: number
  tournament_id: string
  startgg_event_id: number
  phase_id: number
  phase_name: string
  round: number
  slot: number
  startgg_state: number
  state: string
  entrant_a_startgg_id: number | null
  entrant_a_name: string | null
  entrant_b_startgg_id: number | null
  entrant_b_name: string | null
  winner_startgg_id: number | null
  event_starts_at: string | null
  started_at: string | null
  completed_at: string | null
}

/** start.gg timestamps are epoch milliseconds; tournament_sets uses
 * timestamptz (ISO). Null stays null (future/bye sets have no times). */
export function epochToIso(ms: number | null): string | null {
  if (ms == null) return null
  return new Date(ms).toISOString()
}

/**
 * Per-round slot ordinal. Sets carry no intra-round ordering field, so
 * the API's `sortType: STANDARD` order (bracket order) defines it;
 * counters persist across pagination pages so slot assignment is stable
 * for the whole phase fetch. Idempotent re-polls with a stable API
 * order produce identical slots.
 */
export function nextSlot(counters: Map<number, number>, round: number): number {
  const slot = counters.get(round) ?? 0
  counters.set(round, slot + 1)
  return slot
}

/**
 * Maps one start.gg set to a tournament_sets row. slot A is always
 * slots[0] (outcome 0) and slot B slots[1] (outcome 1) — never sorted
 * by name, per the question-id/resolution contract. Byes produce null
 * entrant columns; winner is recorded by raw start.gg entrant id and
 * only when start.gg reports one.
 */
export function buildSetRow(params: {
  tournamentId: string
  eventId: number
  phaseId: number
  phaseName: string
  eventStartsAt: number | null
  set: StartggSet
  slot: number
}): TournamentSetRow {
  const { tournamentId, eventId, phaseId, phaseName, eventStartsAt, set, slot } = params
  const [slotA, slotB] = set.slots ?? []

  return {
    startgg_set_id: Number(set.id),
    tournament_id: tournamentId,
    startgg_event_id: eventId,
    phase_id: phaseId,
    phase_name: phaseName,
    round: set.round,
    slot,
    startgg_state: set.state,
    state: mapStartggState(set.state),
    entrant_a_startgg_id: slotA?.entrant ? Number(slotA.entrant.id) : null,
    entrant_a_name: slotA?.entrant?.name ?? null,
    entrant_b_startgg_id: slotB?.entrant ? Number(slotB.entrant.id) : null,
    entrant_b_name: slotB?.entrant?.name ?? null,
    winner_startgg_id: set.winnerId ? Number(set.winnerId) : null,
    event_starts_at: epochToIso(eventStartsAt),
    started_at: epochToIso(set.startedAt),
    completed_at: epochToIso(set.completedAt),
  }
}

/**
 * Idempotent upsert keyed on the startgg_set_id primary key: re-polling
 * an already-ingested set updates its row instead of duplicating it
 * (same idempotency property the old matches/results deterministic-id
 * path provided, now via the table's real key).
 */
// deno-lint-ignore no-explicit-any
export async function processSet(supabase: any, row: TournamentSetRow): Promise<void> {
  const { error } = await supabase.from('tournament_sets').upsert(row, { onConflict: 'startgg_set_id' })
  if (error) {
    throw new Error(`failed to upsert tournament set ${row.startgg_set_id}: ${error.message}`)
  }
}