// Vitest coverage of the event-indexer's pure reorg-safety + idempotency
// helpers (already unit-tested under `deno test` in
// supabase/functions/event-indexer/reorg.test.ts — see tasks.md 2.4/9.2).
// This file gives the same module Vitest coverage too, per tasks.md
// 13.2's "indexer reorg/idempotency helper coverage" runtime harness
// (`npx vitest`). reorgGuard.ts has zero Deno-specific APIs (no
// Deno.serve/Deno.env), so it imports cleanly under both runtimes.
import { describe, it, expect } from 'vitest'
import {
  filterReorgSafeLogs,
  isAlreadyProcessed,
  nextUnprocessedLogs,
  REORG_DEPTH,
} from '../../../supabase/functions/event-indexer/reorgGuard.ts'

describe('filterReorgSafeLogs', () => {
  it('drops every log within the latest-20 floor', () => {
    const latestBlock = 1000n
    const logs = [
      { blockNumber: 980n, logIndex: 0 },
      { blockNumber: 981n, logIndex: 0 },
      { blockNumber: 999n, logIndex: 0 },
      { blockNumber: 500n, logIndex: 0 },
    ]

    const safe = filterReorgSafeLogs(logs, latestBlock)

    expect(safe.map((l) => l.blockNumber)).toEqual([980n, 500n])
  })

  it('REORG_DEPTH matches Polygon reorg depth (20)', () => {
    expect(REORG_DEPTH).toBe(20)
  })
})

describe('isAlreadyProcessed / nextUnprocessedLogs', () => {
  it('is idempotent: re-running against an advanced cursor processes nothing new', () => {
    const cursor = { lastBlock: 0n, lastLogIndex: -1 }
    const logs = [
      { blockNumber: 5n, logIndex: 0 },
      { blockNumber: 5n, logIndex: 1 },
    ]

    const first = nextUnprocessedLogs(logs, cursor)
    expect(first.toProcess.length).toBe(2)

    const second = nextUnprocessedLogs(logs, first.advanceTo)
    expect(second.toProcess.length).toBe(0)
  })

  it('isAlreadyProcessed compares strictly by (block, logIndex)', () => {
    const cursor = { lastBlock: 100n, lastLogIndex: 3 }
    expect(isAlreadyProcessed({ blockNumber: 100n, logIndex: 3 }, cursor)).toBe(true)
    expect(isAlreadyProcessed({ blockNumber: 100n, logIndex: 4 }, cursor)).toBe(false)
  })
})
