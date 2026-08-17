// Threat-matrix RED (now GREEN against reorgGuard.ts): logs within
// `latest-20` MUST be ignored (reorg depth floor), and re-processing the
// same logs MUST be idempotent. See tasks.md 2.4/9.2 and design.md
// "Indexer reads only up to latest - 20 blocks".

import { assertEquals } from 'jsr:@std/assert@1'
import { filterReorgSafeLogs, isAlreadyProcessed, nextUnprocessedLogs, REORG_DEPTH } from './reorgGuard.ts'

Deno.test('filterReorgSafeLogs: drops every log within the latest-20 floor', () => {
  const latestBlock = 1000n
  const logs = [
    { blockNumber: 980n, logIndex: 0 }, // exactly at the floor (1000-20) — safe
    { blockNumber: 981n, logIndex: 0 }, // one block within the unsafe zone — dropped
    { blockNumber: 999n, logIndex: 0 }, // near tip — dropped
    { blockNumber: 500n, logIndex: 0 }, // well below floor — safe
  ]

  const safe = filterReorgSafeLogs(logs, latestBlock)

  assertEquals(safe.length, 2)
  assertEquals(
    safe.map((l) => l.blockNumber),
    [980n, 500n],
  )
})

Deno.test('filterReorgSafeLogs: returns nothing when the chain has not reached reorg depth yet', () => {
  const safe = filterReorgSafeLogs([{ blockNumber: 5n, logIndex: 0 }], 10n)
  assertEquals(safe.length, 0)
})

Deno.test('filterReorgSafeLogs: REORG_DEPTH matches Polygon reorg depth (20)', () => {
  assertEquals(REORG_DEPTH, 20)
})

Deno.test('isAlreadyProcessed: true for a log at or before the cursor position', () => {
  const cursor = { lastBlock: 100n, lastLogIndex: 3 }
  assertEquals(isAlreadyProcessed({ blockNumber: 99n, logIndex: 99 }, cursor), true)
  assertEquals(isAlreadyProcessed({ blockNumber: 100n, logIndex: 3 }, cursor), true)
  assertEquals(isAlreadyProcessed({ blockNumber: 100n, logIndex: 4 }, cursor), false)
  assertEquals(isAlreadyProcessed({ blockNumber: 101n, logIndex: 0 }, cursor), false)
})

Deno.test('nextUnprocessedLogs: idempotent — re-running with the same logs + advanced cursor processes nothing new', () => {
  const cursor = { lastBlock: 0n, lastLogIndex: -1 }
  const logs = [
    { blockNumber: 5n, logIndex: 0 },
    { blockNumber: 5n, logIndex: 1 },
    { blockNumber: 6n, logIndex: 0 },
  ]

  const first = nextUnprocessedLogs(logs, cursor)
  assertEquals(first.toProcess.length, 3)
  assertEquals(first.advanceTo, { lastBlock: 6n, lastLogIndex: 0 })

  // Re-processing the exact same batch against the advanced cursor
  // (simulating a retried invocation / re-fetch of an overlapping log
  // range) upserts by (block_number, log_index) and finds nothing left
  // to process — no duplicates.
  const second = nextUnprocessedLogs(logs, first.advanceTo)
  assertEquals(second.toProcess.length, 0)
})

Deno.test('nextUnprocessedLogs: out-of-order input logs are still processed in (block, logIndex) order', () => {
  const cursor = { lastBlock: 0n, lastLogIndex: -1 }
  const logs = [
    { blockNumber: 6n, logIndex: 0 },
    { blockNumber: 5n, logIndex: 1 },
    { blockNumber: 5n, logIndex: 0 },
  ]

  const { toProcess } = nextUnprocessedLogs(logs, cursor)

  assertEquals(
    toProcess.map((l) => [l.blockNumber, l.logIndex]),
    [
      [5n, 0],
      [5n, 1],
      [6n, 0],
    ],
  )
})
