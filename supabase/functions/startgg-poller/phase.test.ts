// Threat-matrix RED (now GREEN against phase.ts): the TOP-8 phase must
// be selected deterministically (exact match, then fallback, then
// skip), and start.gg numeric set states must map to the
// tournament_sets.state enum exactly (3→COMPLETED, 2→IN_PROGRESS,
// other→PENDING). See design.md "Poller and Data Flow" and tasks.md
// 2.2/2.4.

import { assertEquals } from 'jsr:@std/assert@1'
import { allSetsCompleted, mapStartggState, normalizePhaseName, pickPhase } from './phase.ts'

// RED (now GREEN): the poller must mark a tournament COMPLETED only when
// EVERY set ingested across all polled phases has state===3 — the phase-only
// check was replaced by the allSetsCompleted accumulator (tasks.md 2.1-2.3).

Deno.test('allSetsCompleted: true only when every set is COMPLETED (state 3)', () => {
  assertEquals(allSetsCompleted([{ state: 3 }, { state: 3 }]), true)
  assertEquals(allSetsCompleted([{ state: 3 }, { state: 2 }]), false)
  assertEquals(allSetsCompleted([{ state: 3 }, { state: 4 }]), false)
})

Deno.test('allSetsCompleted: an empty set list is never completed', () => {
  assertEquals(allSetsCompleted([]), false)
})

Deno.test('normalizePhaseName strips accents, lowercases, and collapses whitespace', () => {
  assertEquals(normalizePhaseName('Top 8 Bracket'), 'top 8 bracket')
  assertEquals(normalizePhaseName('TOP-8'), 'top-8')
  assertEquals(normalizePhaseName('Élimination  Finale'), 'elimination finale')
  assertEquals(normalizePhaseName('  Top   8  '), 'top 8')
})

Deno.test('pickPhase: exact TOP-8 match wins over every fallback candidate', () => {
  const phases = [
    { id: '1', name: 'Pools' },
    { id: '2', name: 'Finals' },
    { id: '3', name: 'Top 8' },
  ]
  assertEquals(pickPhase(phases)?.id, '3')
})

Deno.test('pickPhase: TOP-8 with hyphen or odd spacing still matches', () => {
  assertEquals(pickPhase([{ id: '4', name: 'TOP-8' }])?.id, '4')
  assertEquals(pickPhase([{ id: '5', name: 'Top  8 Bracket' }])?.id, '5')
})

Deno.test('pickPhase: fallback picks the most specific elimination/final phase', () => {
  const phases = [
    { id: '10', name: 'Bracket' },
    { id: '11', name: 'Grand Finals' },
    { id: '12', name: 'Pools' },
  ]
  // "Grand Finals" scores 40 (final) + 0 bracket; "Bracket" scores 20.
  assertEquals(pickPhase(phases)?.id, '11')
})

Deno.test('pickPhase: fallback tie-breaks to the later phase (deeper bracket), then lowest id', () => {
  const phases = [
    { id: '20', name: 'Finals' },
    { id: '21', name: 'Finals' },
  ]
  assertEquals(pickPhase(phases)?.id, '21')
})

Deno.test('pickPhase: returns null when no candidate matches and logs skip upstream', () => {
  assertEquals(pickPhase([{ id: '30', name: 'Pools' }, { id: '31', name: 'Round Robin' }]), null)
  assertEquals(pickPhase([]), null)
  assertEquals(pickPhase(null), null)
})

Deno.test('pickPhase: normalized accent variants reach the fallback (Élimination)', () => {
  const phases = [
    { id: '40', name: 'Pools' },
    { id: '41', name: 'Élimination' },
  ]
  assertEquals(pickPhase(phases)?.id, '41')
})

Deno.test('mapStartggState: 3 → COMPLETED, 2 → IN_PROGRESS, everything else → PENDING', () => {
  assertEquals(mapStartggState(3), 'COMPLETED')
  assertEquals(mapStartggState(2), 'IN_PROGRESS')
  assertEquals(mapStartggState(0), 'PENDING')
  assertEquals(mapStartggState(1), 'PENDING')
  assertEquals(mapStartggState(4), 'PENDING')
})