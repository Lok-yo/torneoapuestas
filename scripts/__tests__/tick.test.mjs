// RED (Phase 3, task 3.1): scripts/settlement/tick.mjs does not exist
// yet. Covers every closed skip reason (no_market, market_challenged,
// market_not_active, window_open, disputed, already_claimed) plus the
// postResult/settle/claim happy paths, against fake db/clients — see
// design.md "Interfaces / Contracts" (closed skip-reason set) and
// "Testing Strategy", and spec "Settlement Scope", "Sequencing",
// "Idempotency".

import { describe, expect, it, vi } from 'vitest'
import { runTick } from '../settlement/tick.mjs'

const ADAPTER = '0x000000000000000000000000000000000adapt'
const HOUSE_BANK = '0x0000000000000000000000000000000house1'
const CHALLENGE_WINDOW = 14400n // 4h, matches ResolutionAdapter.CHALLENGE_WINDOW

const NONE_RESOLUTION = [0, `0x${'0'.repeat(64)}`, 0n, 0, '0x0000000000000000000000000000000000dEaD', 0n]

function makeSet(overrides = {}) {
  return {
    startgg_set_id: 1,
    entrant_a_startgg_id: 111,
    entrant_b_startgg_id: 222,
    winner_startgg_id: 111,
    question_id: '0x' + '11'.repeat(32),
    market_state: 'ACTIVE',
    ...overrides,
  }
}

function makeClients({ resolutionsByQuestion = {}, claimedByQuestion = {} } = {}) {
  const writes = []
  const publicClient = {
    readContract: vi.fn(async ({ address, functionName, args }) => {
      if (functionName === 'CHALLENGE_WINDOW') return CHALLENGE_WINDOW
      if (functionName === 'resolutions') return resolutionsByQuestion[args[0]] ?? NONE_RESOLUTION
      if (functionName === 'claimed') return claimedByQuestion[args[0]] ?? false
      throw new Error(`unexpected readContract call: ${functionName} @ ${address}`)
    }),
    waitForTransactionReceipt: vi.fn(async () => ({ status: 'success' })),
  }
  const walletClient = {
    writeContract: vi.fn(async (call) => {
      writes.push(call)
      return `0xhash${writes.length}`
    }),
  }
  return { publicClient, walletClient, writes }
}

const addresses = { resolutionAdapter: ADAPTER, houseBank: HOUSE_BANK }

describe('runTick', () => {
  it('posts a result for a fresh completed set (resolution state NONE)', async () => {
    const set = makeSet()
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients()

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 1_000 })

    expect(result.scanned).toBe(1)
    expect(result.posted).toBe(1)
    expect(result.skipped).toEqual([])
    expect(writes).toHaveLength(1)
    expect(writes[0].functionName).toBe('postResult')
    expect(writes[0].address).toBe(ADAPTER)
    expect(writes[0].args[0]).toBe(set.question_id)
    expect(writes[0].args[1]).toBe(0) // entrant A won -> winningIndex 0
  })

  it('derives winningIndex 1 when entrant B is the winner', async () => {
    const set = makeSet({ winner_startgg_id: 222 })
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients()

    await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(writes[0].args[1]).toBe(1)
  })

  it('settles a PROPOSED result once the challenge window has elapsed', async () => {
    const set = makeSet()
    const postedAt = 1_000n
    const resolutionsByQuestion = { [set.question_id]: [0, `0x${'0'.repeat(64)}`, postedAt, 1, '0x0', 0n] }
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients({ resolutionsByQuestion })

    const now = Number(postedAt) + Number(CHALLENGE_WINDOW) + 1
    const result = await runTick({ db, publicClient, walletClient, addresses, now })

    expect(result.settled).toBe(1)
    expect(result.posted).toBe(0)
    expect(writes).toHaveLength(1)
    expect(writes[0].functionName).toBe('settle')
    expect(writes[0].args).toEqual([set.question_id])
  })

  it('skips a PROPOSED result inside the challenge window (window_open)', async () => {
    const set = makeSet()
    const postedAt = 1_000n
    const resolutionsByQuestion = { [set.question_id]: [0, `0x${'0'.repeat(64)}`, postedAt, 1, '0x0', 0n] }
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients({ resolutionsByQuestion })

    const now = Number(postedAt) + 100
    const result = await runTick({ db, publicClient, walletClient, addresses, now })

    expect(result.settled).toBe(0)
    expect(writes).toHaveLength(0)
    expect(result.skipped).toEqual([{ setId: set.startgg_set_id, reason: 'window_open' }])
  })

  it('claims a SETTLED, unclaimed result', async () => {
    const set = makeSet()
    const resolutionsByQuestion = { [set.question_id]: [0, `0x${'0'.repeat(64)}`, 0n, 3, '0x0', 0n] }
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients({
      resolutionsByQuestion,
      claimedByQuestion: { [set.question_id]: false },
    })

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(result.claimed).toBe(1)
    expect(writes).toHaveLength(1)
    expect(writes[0].functionName).toBe('claim')
    expect(writes[0].address).toBe(HOUSE_BANK)
    expect(writes[0].args).toEqual([set.question_id])
  })

  it('skips an already-claimed SETTLED result (already_claimed, idempotency)', async () => {
    const set = makeSet()
    const resolutionsByQuestion = { [set.question_id]: [0, `0x${'0'.repeat(64)}`, 0n, 3, '0x0', 0n] }
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients({
      resolutionsByQuestion,
      claimedByQuestion: { [set.question_id]: true },
    })

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(result.claimed).toBe(0)
    expect(writes).toHaveLength(0)
    expect(result.skipped).toEqual([{ setId: set.startgg_set_id, reason: 'already_claimed' }])
  })

  it('skips a DISPUTED result (disputed)', async () => {
    const set = makeSet()
    const resolutionsByQuestion = { [set.question_id]: [0, `0x${'0'.repeat(64)}`, 0n, 2, '0xdisputer', 100n] }
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients({ resolutionsByQuestion })

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(writes).toHaveLength(0)
    expect(result.skipped).toEqual([{ setId: set.startgg_set_id, reason: 'disputed' }])
  })

  it('skips a set with no on-chain market and never reads chain resolution state (no_market)', async () => {
    const set = makeSet({ question_id: null, market_state: null })
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients()

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(writes).toHaveLength(0)
    expect(result.skipped).toEqual([{ setId: set.startgg_set_id, reason: 'no_market' }])
    expect(publicClient.readContract).not.toHaveBeenCalledWith(expect.objectContaining({ functionName: 'resolutions' }))
  })

  it('skips a CHALLENGED market (market_challenged)', async () => {
    const set = makeSet({ market_state: 'CHALLENGED' })
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients()

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(writes).toHaveLength(0)
    expect(result.skipped).toEqual([{ setId: set.startgg_set_id, reason: 'market_challenged' }])
  })

  it('skips a PENDING (not yet ACTIVE) market (market_not_active)', async () => {
    const set = makeSet({ market_state: 'PENDING' })
    const db = { fetchEligibleSets: async () => [set] }
    const { publicClient, walletClient, writes } = makeClients()

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(writes).toHaveLength(0)
    expect(result.skipped).toEqual([{ setId: set.startgg_set_id, reason: 'market_not_active' }])
  })

  it('scans multiple sets independently and aggregates counts across mixed outcomes', async () => {
    const posted = makeSet({ startgg_set_id: 1 })
    const challenged = makeSet({ startgg_set_id: 2, market_state: 'CHALLENGED' })
    const db = { fetchEligibleSets: async () => [posted, challenged] }
    const { publicClient, walletClient } = makeClients()

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(result.scanned).toBe(2)
    expect(result.posted).toBe(1)
    expect(result.skipped).toEqual([{ setId: 2, reason: 'market_challenged' }])
  })

  it('returns a zeroed result and never touches the chain when no sets are eligible', async () => {
    const db = { fetchEligibleSets: async () => [] }
    const { publicClient, walletClient, writes } = makeClients()

    const result = await runTick({ db, publicClient, walletClient, addresses, now: 0 })

    expect(result).toEqual({ scanned: 0, posted: 0, settled: 0, claimed: 0, skipped: [] })
    expect(writes).toHaveLength(0)
  })
})
