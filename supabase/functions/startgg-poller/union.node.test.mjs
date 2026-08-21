import test from 'node:test'
import assert from 'node:assert/strict'
import { buildUnionWork } from './union.ts'

test('buildUnionWork dedupes events that appear in both MX and tracked lanes', () => {
  const mxEvents = [
    { startgg_event_id: 101, name: 'MX Event 101' },
    { startgg_event_id: 102, name: 'MX Event 102' },
  ]
  const trackedEvents = [
    { startgg_event_id: 102, name: 'Tracked Event 102' },
    { startgg_event_id: 103, name: 'Tracked Event 103' },
  ]

  const work = buildUnionWork(mxEvents, trackedEvents)

  assert.equal(work.length, 3)
  assert.deepEqual(work.find((w) => w.event_id === 101), {
    event_id: 101,
    source: 'mx',
    needsEventFetch: false,
  })
  assert.deepEqual(work.find((w) => w.event_id === 102), {
    event_id: 102,
    source: 'both',
    needsEventFetch: false,
  })
  assert.deepEqual(work.find((w) => w.event_id === 103), {
    event_id: 103,
    source: 'tracked',
    needsEventFetch: true,
  })
})

test('buildUnionWork handles empty lists gracefully', () => {
  assert.deepEqual(buildUnionWork([], []), [])
  assert.equal(buildUnionWork([{ startgg_event_id: 1 }], []).length, 1)
})
