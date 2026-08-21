import { assertEquals } from 'jsr:@std/assert@1'
import { resolveSupportedEvent } from './resolver.ts'

const events = [
  { id: '20', slug: 'unsupported', name: 'Unsupported', videogame: { id: 999 } },
  { id: '12', slug: 'doubles', name: 'Doubles', videogame: { id: 1386 } },
  { id: '11', slug: 'singles', name: 'Singles', videogame: { id: 1386 } },
]

Deno.test('resolveSupportedEvent selects the requested supported event', () => {
  assertEquals(resolveSupportedEvent(events, 'doubles')?.event.slug, 'doubles')
})

Deno.test('resolveSupportedEvent selects the lowest supported event id when no event is requested', () => {
  assertEquals(resolveSupportedEvent(events)?.event.slug, 'singles')
})

Deno.test('resolveSupportedEvent rejects an unknown or unsupported requested event', () => {
  assertEquals(resolveSupportedEvent(events, 'missing'), null)
  assertEquals(resolveSupportedEvent(events, 'unsupported'), null)
})
