import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSupportedEvent } from './resolver.ts'

const events = [
  { id: '20', slug: 'unsupported', name: 'Unsupported', videogame: { id: 999 } },
  { id: '12', slug: 'doubles', name: 'Doubles', videogame: { id: 1386 } },
  { id: '11', slug: 'singles', name: 'Singles', videogame: { id: 1386 } },
]

test('resolveSupportedEvent honors the requested event slug', () => {
  assert.equal(resolveSupportedEvent(events, 'doubles')?.event.slug, 'doubles')
})

test('resolveSupportedEvent picks the lowest supported event id', () => {
  assert.equal(resolveSupportedEvent(events)?.event.slug, 'singles')
})

test('resolveSupportedEvent rejects unknown and unsupported events', () => {
  assert.equal(resolveSupportedEvent(events, 'missing'), null)
  assert.equal(resolveSupportedEvent(events, 'unsupported'), null)
})
