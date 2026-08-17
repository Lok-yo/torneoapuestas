// Pure request-budget + backoff logic for startgg-poller, split out from
// index.ts so it can be unit-tested with `deno test` without any Deno.serve
// side effect or live start.gg/Supabase network dependency. See
// design.md "Polling budget (~80 req/60s)" and
// startgg-tournament-ingestion spec "Rate Limit Budget Across Market
// Types" / "Rate limit response handled without data loss".

/** Self-imposed cap, 25% headroom under start.gg's ~80 req/60s limit. */
export const CYCLE_REQUEST_CAP = 60

/** Round-robin polling lanes, one MX active-tournament slice each. */
export type Lane = 'sets' | 'standings' | 'discovery'

export interface CursorState {
  lastPolledAt: string | null
  lastCompletedAt: string | null
  backoffUntil: string | null
  cycleRequests: number
}

export interface RateLimitSignal {
  /** true if start.gg responded 429 for this request. */
  isRateLimited: boolean
  /** Seconds from `retry-after`, if start.gg sent one. */
  retryAfterSeconds?: number
}

/**
 * Given a 429 response signal, computes the `backoff_until` timestamp the
 * cursor should persist. Falls back to a fixed 60s backoff when start.gg
 * sends no `retry-after` header, so a single rate-limit response always
 * yields a bounded, deterministic pause — never an indefinite stall.
 */
export function computeBackoffUntil(signal: RateLimitSignal, now: Date = new Date()): Date | null {
  if (!signal.isRateLimited) return null
  const seconds = signal.retryAfterSeconds && signal.retryAfterSeconds > 0 ? signal.retryAfterSeconds : 60
  return new Date(now.getTime() + seconds * 1000)
}

/** True when the cursor's backoff window has not yet elapsed. */
export function isBackingOff(cursor: Pick<CursorState, 'backoffUntil'>, now: Date = new Date()): boolean {
  if (!cursor.backoffUntil) return false
  return new Date(cursor.backoffUntil).getTime() > now.getTime()
}

/**
 * Round-robin lane scheduler: picks the next lane to poll this cycle
 * given how many cycles have elapsed, guaranteeing neither `sets` nor
 * `standings` starves the other (spec "Combined polling stays under rate
 * limit" — requests scheduled/batched across both market types) while
 * `discovery` (new MX tournaments) runs once every 10 cycles per
 * design.md "Polling budget".
 */
export function laneForCycle(cycleIndex: number): Lane[] {
  const lanes: Lane[] = ['sets']
  // standings only on tournament-state flip in the real worker, but the
  // scheduler still reserves lane time for it every other cycle so a
  // burst of flips never starves `sets`.
  if (cycleIndex % 2 === 1) lanes.push('standings')
  if (cycleIndex % 10 === 0) lanes.push('discovery')
  return lanes
}

/**
 * Tracks a request budget within one polling cycle. Returns false (and
 * never increments) once the cap is reached, so callers stop issuing
 * requests for this cycle instead of exceeding the ~80/60s ceiling.
 */
export class CycleBudget {
  private used = 0
  constructor(private readonly cap: number = CYCLE_REQUEST_CAP) {}

  tryConsume(count = 1): boolean {
    if (this.used + count > this.cap) return false
    this.used += count
    return true
  }

  get remaining(): number {
    return this.cap - this.used
  }
}

/**
 * Splits a work list (e.g. tournaments needing a poll this cycle) into
 * "processed this cycle" and "deferred to next cycle", given a request
 * budget already partially consumed — used to prove no tournament is
 * ever silently dropped on a 429 mid-cycle, only deferred (spec
 * "Rate limit response handled without data loss").
 */
export function partitionByBudget<T>(items: T[], budget: CycleBudget, costPerItem = 1): { processed: T[]; deferred: T[] } {
  const processed: T[] = []
  const deferred: T[] = []
  for (const item of items) {
    if (budget.tryConsume(costPerItem)) {
      processed.push(item)
    } else {
      deferred.push(item)
    }
  }
  return { processed, deferred }
}
