// Node-runnable companion to settlement-mapping.test.ts (same pattern as
// startgg-import/resolver.node.test.mjs) — settlement-mapping.js has zero
// Deno-specific dependencies, so this file lets `node --test` and vitest
// actually EXECUTE these assertions in an environment without `deno` on
// PATH, instead of only syntax-checking. See tasks.md 1.2/2.1/2.2.

import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveWinningIndex, resultRefPreimage } from './settlement-mapping.js'

test('deriveWinningIndex: winner matches entrant A -> 0', () => {
  assert.equal(deriveWinningIndex({ winner_startgg_id: 111, entrant_a_startgg_id: 111, entrant_b_startgg_id: 222 }), 0)
})

test('deriveWinningIndex: winner matches entrant B -> 1', () => {
  assert.equal(deriveWinningIndex({ winner_startgg_id: 222, entrant_a_startgg_id: 111, entrant_b_startgg_id: 222 }), 1)
})

test('deriveWinningIndex: null winner -> null (never guess a result)', () => {
  assert.equal(deriveWinningIndex({ winner_startgg_id: null, entrant_a_startgg_id: 111, entrant_b_startgg_id: 222 }), null)
})

test('deriveWinningIndex: winner matches neither entrant -> null (bad data, never guess)', () => {
  assert.equal(deriveWinningIndex({ winner_startgg_id: 999, entrant_a_startgg_id: 111, entrant_b_startgg_id: 222 }), null)
})

test('resultRefPreimage: deterministic per startgg_set_id', () => {
  assert.equal(resultRefPreimage(4242), 'set:4242')
  assert.equal(resultRefPreimage(4242), resultRefPreimage(4242))
})

test('resultRefPreimage: different set ids produce different preimages', () => {
  assert.notEqual(resultRefPreimage(1), resultRefPreimage(2))
})
