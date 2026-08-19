// Threat-matrix RED (now GREEN against sets.ts): the poller's set→row
// mapping must preserve API slot order A/B (never sorted by name),
// tolerate nullable byes, derive event_starts_at from the event (not
// Date.now()), and upsert idempotently on the set primary key. See
// design.md "Question ID and Resolution Contract" and tasks.md 2.3/2.4.

import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { buildSetRow, epochToIso, nextSlot, processSet, type StartggSet, type TournamentSetRow } from './sets.ts'

const COMPLETED_SET: StartggSet = {
  id: '9001',
  round: 1,
  state: 3,
  startedAt: 1_750_000_000_000,
  completedAt: 1_750_000_600_000,
  winnerId: '7001',
  slots: [
    { entrant: { id: '7001', name: 'Alpha' } },
    { entrant: { id: '7002', name: 'Bravo' } },
  ],
}

Deno.test('buildSetRow: maps a completed set with A/B order preserved and winner by raw id', () => {
  const row = buildSetRow({
    tournamentId: 't-1',
    eventId: 50001,
    phaseId: 3001,
    phaseName: 'Top 8',
    eventStartsAt: 1_749_990_000_000,
    set: COMPLETED_SET,
    slot: 0,
  })

  assertEquals(row.startgg_set_id, 9001)
  assertEquals(row.tournament_id, 't-1')
  assertEquals(row.startgg_event_id, 50001)
  assertEquals(row.phase_id, 3001)
  assertEquals(row.phase_name, 'Top 8')
  assertEquals(row.round, 1)
  assertEquals(row.slot, 0)
  assertEquals(row.startgg_state, 3)
  assertEquals(row.state, 'COMPLETED')
  assertEquals(row.entrant_a_startgg_id, 7001)
  assertEquals(row.entrant_a_name, 'Alpha')
  assertEquals(row.entrant_b_startgg_id, 7002)
  assertEquals(row.entrant_b_name, 'Bravo')
  assertEquals(row.winner_startgg_id, 7001)
  assertEquals(row.event_starts_at, '2025-06-15T10:00:00.000Z')
  assertEquals(row.started_at, '2025-06-15T12:26:40.000Z')
  assertEquals(row.completed_at, '2025-06-15T12:36:40.000Z')
})

Deno.test('buildSetRow: never sorts entrants by name — slot A stays slots[0]', () => {
  const row = buildSetRow({
    tournamentId: 't-1',
    eventId: 50001,
    phaseId: 3001,
    phaseName: 'Top 8',
    eventStartsAt: null,
    set: {
      id: '9002',
      round: 1,
      state: 2,
      startedAt: null,
      completedAt: null,
      winnerId: null,
      slots: [
        { entrant: { id: '7777', name: 'Zeta' } },
        { entrant: { id: '1111', name: 'Alpha' } },
      ],
    },
    slot: 1,
  })
  assertEquals(row.entrant_a_startgg_id, 7777, 'slot A is the API first slot regardless of name')
  assertEquals(row.entrant_b_startgg_id, 1111)
  assertEquals(row.state, 'IN_PROGRESS')
  assertEquals(row.winner_startgg_id, null)
})

Deno.test('buildSetRow: a bye (null slot) yields null entrant columns, not a crash', () => {
  const row = buildSetRow({
    tournamentId: 't-1',
    eventId: 50001,
    phaseId: 3001,
    phaseName: 'Top 8',
    eventStartsAt: 1_749_990_000_000,
    set: {
      id: '9003',
      round: 2,
      state: 0,
      startedAt: null,
      completedAt: null,
      winnerId: null,
      slots: [{ entrant: { id: '7001', name: 'Alpha' } }, { entrant: null }],
    },
    slot: 0,
  })
  assertEquals(row.state, 'PENDING')
  assertEquals(row.entrant_a_name, 'Alpha')
  assertEquals(row.entrant_b_startgg_id, null)
  assertEquals(row.entrant_b_name, null)
  assertEquals(row.completed_at, null)
})

Deno.test('buildSetRow: no slots at all is tolerated (malformed upstream response)', () => {
  const row = buildSetRow({
    tournamentId: 't-1',
    eventId: 50001,
    phaseId: 3001,
    phaseName: 'Top 8',
    eventStartsAt: null,
    set: { id: '9004', round: 3, state: 0, startedAt: null, completedAt: null, winnerId: null, slots: [] },
    slot: 0,
  })
  assertEquals(row.entrant_a_name, null)
  assertEquals(row.entrant_b_name, null)
})

Deno.test('nextSlot: assigns per-round ordinals across pagination pages', () => {
  const counters = new Map<number, number>()
  assertEquals(nextSlot(counters, 1), 0)
  assertEquals(nextSlot(counters, 1), 1)
  assertEquals(nextSlot(counters, 2), 0)
  assertEquals(nextSlot(counters, 1), 2)
})

Deno.test('epochToIso: null stays null, ms converts to ISO', () => {
  assertEquals(epochToIso(null), null)
  assertEquals(epochToIso(1_750_000_000_000), '2025-06-15T12:26:40.000Z')
})

Deno.test('processSet: upserts on the startgg_set_id primary key (idempotent re-poll)', async () => {
  const calls: Array<{ table: string; row: TournamentSetRow; options: unknown }> = []
  const fakeSupabase = {
    from: (table: string) => ({
      upsert: async (row: TournamentSetRow, options: unknown) => {
        calls.push({ table, row, options })
        return { error: null }
      },
    }),
  }

  const row = buildSetRow({
    tournamentId: 't-1',
    eventId: 50001,
    phaseId: 3001,
    phaseName: 'Top 8',
    eventStartsAt: null,
    set: COMPLETED_SET,
    slot: 0,
  })
  await processSet(fakeSupabase, row)

  assertEquals(calls.length, 1)
  assertEquals(calls[0].table, 'tournament_sets')
  assertEquals(calls[0].options, { onConflict: 'startgg_set_id' })
  assertEquals(calls[0].row.startgg_set_id, 9001)
})

Deno.test('processSet: surfaces the upsert error so the cycle logs the failed set', async () => {
  const fakeSupabase = {
    from: () => ({
      upsert: async () => ({ error: { message: 'relation does not exist' } }),
    }),
  }
  const row = buildSetRow({
    tournamentId: 't-1',
    eventId: 50001,
    phaseId: 3001,
    phaseName: 'Top 8',
    eventStartsAt: null,
    set: COMPLETED_SET,
    slot: 0,
  })
  await assertRejects(() => processSet(fakeSupabase, row), /relation does not exist/)
})