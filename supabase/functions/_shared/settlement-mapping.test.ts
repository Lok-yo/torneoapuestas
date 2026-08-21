// RED (Phase 1/2, tasks 1.2/2.1): deriveWinningIndex/resultRefPreimage
// don't exist yet. Canonical Deno test — see settlement-mapping.node.test.mjs
// for the real-execution Node companion (this module is dependency-free,
// so it runs identically under both runtimes). See spec "winningIndex
// Derivation" / "resultRef Derivation".

import { assertEquals, assertNotEquals } from 'jsr:@std/assert@1'
import { deriveWinningIndex, resultRefPreimage } from './settlement-mapping.js'

Deno.test('deriveWinningIndex: winner matches entrant A -> 0', () => {
  assertEquals(
    deriveWinningIndex({ winner_startgg_id: 111, entrant_a_startgg_id: 111, entrant_b_startgg_id: 222 }),
    0,
  )
})

Deno.test('deriveWinningIndex: winner matches entrant B -> 1', () => {
  assertEquals(
    deriveWinningIndex({ winner_startgg_id: 222, entrant_a_startgg_id: 111, entrant_b_startgg_id: 222 }),
    1,
  )
})

Deno.test('deriveWinningIndex: null winner -> null (never guess a result)', () => {
  assertEquals(
    deriveWinningIndex({ winner_startgg_id: null, entrant_a_startgg_id: 111, entrant_b_startgg_id: 222 }),
    null,
  )
})

Deno.test('deriveWinningIndex: winner matches neither entrant -> null (bad data, never guess)', () => {
  assertEquals(
    deriveWinningIndex({ winner_startgg_id: 999, entrant_a_startgg_id: 111, entrant_b_startgg_id: 222 }),
    null,
  )
})

Deno.test('resultRefPreimage: deterministic per startgg_set_id', () => {
  assertEquals(resultRefPreimage(4242), 'set:4242')
  assertEquals(resultRefPreimage(4242), resultRefPreimage(4242))
})

Deno.test('resultRefPreimage: different set ids produce different preimages', () => {
  assertNotEquals(resultRefPreimage(1), resultRefPreimage(2))
})
