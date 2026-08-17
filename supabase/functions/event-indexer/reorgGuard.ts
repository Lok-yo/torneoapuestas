// Pure reorg-safety + idempotency logic for event-indexer, split out from
// index.ts so it can be unit-tested with `deno test` without a live viem
// RPC connection. See design.md "Indexer reads only up to latest - 20
// blocks (Polygon reorg depth) and upserts by (block_number, log_index)"
// and tasks.md 2.4/9.2.

export const REORG_DEPTH = 20

export interface LogLike {
  blockNumber: bigint
  logIndex: number
}

/**
 * Filters out any log within the last `REORG_DEPTH` blocks of the chain
 * tip — those blocks can still be reorganized away, so the indexer never
 * treats them as final. Returns only logs at or below `latestBlock -
 * REORG_DEPTH`.
 */
export function filterReorgSafeLogs<T extends LogLike>(logs: T[], latestBlock: bigint, reorgDepth: bigint = BigInt(REORG_DEPTH)): T[] {
  if (latestBlock < reorgDepth) return []
  const safeFloor = latestBlock - reorgDepth
  return logs.filter((log) => log.blockNumber <= safeFloor)
}

export interface EventCursor {
  lastBlock: bigint
  lastLogIndex: number
}

/**
 * True when a log has already been processed per the persisted cursor —
 * strictly ordered by (block_number, log_index), matching the DB upsert
 * key in 0020_wallet_and_onchain_cache.sql's `onchain_events_cursor`.
 * Reprocessing the exact same log (e.g. a retried function invocation)
 * is always a safe no-op via this check, giving idempotent upserts.
 */
export function isAlreadyProcessed(log: LogLike, cursor: EventCursor): boolean {
  if (log.blockNumber < cursor.lastBlock) return true
  if (log.blockNumber > cursor.lastBlock) return false
  return log.logIndex <= cursor.lastLogIndex
}

/** Given a batch of reorg-safe logs, returns only the ones not yet
 * processed per the cursor, plus the cursor position the batch should
 * advance to (the last log's block/index) — both idempotent under a
 * repeated call with the same logs + cursor. */
export function nextUnprocessedLogs<T extends LogLike>(logs: T[], cursor: EventCursor): { toProcess: T[]; advanceTo: EventCursor } {
  const sorted = [...logs].sort((a, b) => {
    if (a.blockNumber !== b.blockNumber) return a.blockNumber < b.blockNumber ? -1 : 1
    return a.logIndex - b.logIndex
  })

  const toProcess = sorted.filter((log) => !isAlreadyProcessed(log, cursor))

  const last = sorted[sorted.length - 1]
  const advanceTo: EventCursor = last ? { lastBlock: last.blockNumber, lastLogIndex: last.logIndex } : cursor

  return { toProcess, advanceTo }
}
