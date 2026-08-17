// Threat-matrix RED (now GREEN against backoff.ts): a 429 from start.gg
// must back off deterministically and resume at the cursor next cycle —
// never drop unprocessed tournaments. See tasks.md 2.5/8.4 and
// startgg-tournament-ingestion spec "Rate limit response handled without
// data loss".

import { assert, assertEquals, assertFalse } from 'jsr:@std/assert@1'
import {
  computeBackoffUntil,
  CycleBudget,
  isBackingOff,
  laneForCycle,
  partitionByBudget,
} from './backoff.ts'

Deno.test('computeBackoffUntil: no rate limit signal => no backoff', () => {
  const result = computeBackoffUntil({ isRateLimited: false })
  assertEquals(result, null)
})

Deno.test('computeBackoffUntil: 429 with retry-after honors the given seconds', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')
  const result = computeBackoffUntil({ isRateLimited: true, retryAfterSeconds: 30 }, now)
  assertEquals(result?.toISOString(), '2026-01-01T00:00:30.000Z')
})

Deno.test('computeBackoffUntil: 429 with no retry-after falls back to a bounded 60s pause', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')
  const result = computeBackoffUntil({ isRateLimited: true }, now)
  assertEquals(result?.toISOString(), '2026-01-01T00:01:00.000Z')
})

Deno.test('isBackingOff: true strictly before backoff_until elapses', () => {
  const now = new Date('2026-01-01T00:00:00.000Z')
  const cursor = { backoffUntil: '2026-01-01T00:00:30.000Z' }
  assert(isBackingOff(cursor, now))
})

Deno.test('isBackingOff: false once backoff_until has elapsed', () => {
  const now = new Date('2026-01-01T00:01:00.000Z')
  const cursor = { backoffUntil: '2026-01-01T00:00:30.000Z' }
  assertFalse(isBackingOff(cursor, now))
})

Deno.test('isBackingOff: false when no backoff was ever set', () => {
  assertFalse(isBackingOff({ backoffUntil: null }))
})

Deno.test('laneForCycle: sets every cycle, standings on odd cycles, discovery every 10th', () => {
  assertEquals(laneForCycle(0), ['sets', 'discovery'])
  assertEquals(laneForCycle(1), ['sets', 'standings'])
  assertEquals(laneForCycle(2), ['sets'])
  assertEquals(laneForCycle(10), ['sets', 'discovery'])
})

Deno.test('CycleBudget: stays within the ~80/60s cap (60-request self-imposed ceiling)', () => {
  const budget = new CycleBudget(60)
  for (let i = 0; i < 60; i++) {
    assert(budget.tryConsume(1), `request ${i} should fit under the cap`)
  }
  assertFalse(budget.tryConsume(1), 'the 61st request must not be allowed to exceed the cap')
})

Deno.test('partitionByBudget: 429 mid-cycle defers remaining tournaments instead of dropping them', () => {
  const tournaments = Array.from({ length: 10 }, (_, i) => `tournament-${i}`)
  const budget = new CycleBudget(6)

  const { processed, deferred } = partitionByBudget(tournaments, budget)

  assertEquals(processed.length, 6)
  assertEquals(deferred.length, 4)
  // Every tournament is accounted for exactly once across processed +
  // deferred — none silently dropped.
  assertEquals(new Set([...processed, ...deferred]).size, 10)
})
