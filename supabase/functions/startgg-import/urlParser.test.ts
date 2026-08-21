import { assertEquals } from 'jsr:@std/assert@1'
import { parseStartggUrl } from './urlParser.ts'

Deno.test('parseStartggUrl extracts tournament and event from a bracket URL', () => {
  assertEquals(
    parseStartggUrl('https://www.start.gg/tournament/the-cashbox-37-global-edition/event/ultimate-singles/brackets/2368581/3418801'),
    { tournamentSlug: 'the-cashbox-37-global-edition', eventSlug: 'ultimate-singles' },
  )
})

Deno.test('parseStartggUrl accepts a tournament-only URL for deterministic event resolution', () => {
  assertEquals(parseStartggUrl('https://start.gg/tournament/smash-factor-11/'), {
    tournamentSlug: 'smash-factor-11',
  })
})

Deno.test('parseStartggUrl rejects unsupported hosts and malformed paths', () => {
  assertEquals(parseStartggUrl('https://example.com/tournament/valid/event/singles'), null)
  assertEquals(parseStartggUrl('https://start.gg/tournament//event/singles'), null)
  assertEquals(parseStartggUrl('https://start.gg/event/singles'), null)
  assertEquals(parseStartggUrl('not a url'), null)
})
