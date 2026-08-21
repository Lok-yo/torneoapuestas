import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStartggUrl } from './urlParser.ts'

test('parseStartggUrl extracts event from a bracket URL', () => {
  assert.deepEqual(
    parseStartggUrl('https://www.start.gg/tournament/the-cashbox-37-global-edition/event/ultimate-singles/brackets/2368581/3418801'),
    { tournamentSlug: 'the-cashbox-37-global-edition', eventSlug: 'ultimate-singles' },
  )
})

test('parseStartggUrl returns a tournament-only slug', () => {
  assert.deepEqual(parseStartggUrl('https://start.gg/tournament/smash-factor-11/'), {
    tournamentSlug: 'smash-factor-11',
  })
})

test('parseStartggUrl rejects malformed or foreign URLs', () => {
  assert.equal(parseStartggUrl('https://example.com/tournament/valid/event/singles'), null)
  assert.equal(parseStartggUrl('https://start.gg/tournament//event/singles'), null)
  assert.equal(parseStartggUrl('not a url'), null)
})
