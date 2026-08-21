// Runtime-agnostic settlement cycle core. Every external dependency is
// injected (db/publicClient/walletClient/addresses/now) so this is fully
// unit-testable with fake db/clients — no real network/RPC in tests. The
// SAME function runs today wrapped in an interval by
// scripts/settlement-loop.mjs, and later (VPS day) is wrapped by a
// Supabase Edge Function cron handler with swapped Deno imports — see
// design.md "tick core is runtime-agnostic" and spec "Settlement Scope",
// "postResult -> settle -> claim Sequencing", "Idempotency".

import { keccak256, toBytes } from 'viem'
import { parseAbi } from 'viem'
import { deriveWinningIndex, resultRefPreimage } from '../../supabase/functions/_shared/settlement-mapping.js'

const RESOLUTION_ADAPTER_ABI = parseAbi([
  'function CHALLENGE_WINDOW() view returns (uint256)',
  'function resolutions(bytes32) view returns (uint8 winningIndex, bytes32 resultRef, uint256 postedAt, uint8 state, address disputer, uint256 disputeBond)',
  'function postResult(bytes32 questionId, uint8 winningIndex, bytes32 resultRef)',
  'function settle(bytes32 questionId)',
])

const HOUSE_BANK_ABI = parseAbi([
  'function claimed(bytes32) view returns (bool)',
  'function claim(bytes32 questionId)',
])

// Mirrors ResolutionAdapter.ResultState (contracts/src/ResolutionAdapter.sol).
const RESULT_STATE = { NONE: 0, PROPOSED: 1, DISPUTED: 2, SETTLED: 3 }

/**
 * Runs one settlement cycle: fetches eligible sets, skips ineligible
 * ones per the closed skip-reason set, and drives each eligible market
 * through at most one of postResult/settle/claim based on its current
 * on-chain ResolutionAdapter.ResultState. Read-then-write only — never
 * revert-parses a failed write as a skip (design.md "read-then-write,
 * never revert-parsing").
 *
 * @param {object} deps
 * @param {{ fetchEligibleSets: () => Promise<Array<object>> }} deps.db
 * @param {object} deps.publicClient - viem PublicClient (readContract, waitForTransactionReceipt)
 * @param {object} deps.walletClient - viem WalletClient (writeContract)
 * @param {{ resolutionAdapter: string, houseBank: string }} deps.addresses
 * @param {number} [deps.now] - unix seconds; defaults to current time
 * @param {{ error: Function }} [deps.log] - defaults to console
 * @returns {Promise<{ scanned: number, posted: number, settled: number, claimed: number, skipped: Array<{ setId: unknown, reason: string }> }>}
 */
export async function runTick({
  db,
  publicClient,
  walletClient,
  addresses,
  now = Math.floor(Date.now() / 1000),
  log = console,
}) {
  const result = { scanned: 0, posted: 0, settled: 0, claimed: 0, skipped: [] }

  const sets = await db.fetchEligibleSets()
  result.scanned = sets.length

  let challengeWindow // lazily read on first PROPOSED case — never touch the chain when there's nothing to process
  const readChallengeWindow = async () => {
    if (challengeWindow === undefined) {
      challengeWindow = await publicClient.readContract({
        address: addresses.resolutionAdapter,
        abi: RESOLUTION_ADAPTER_ABI,
        functionName: 'CHALLENGE_WINDOW',
      })
    }
    return challengeWindow
  }

  for (const set of sets) {
    const skip = (reason) => result.skipped.push({ setId: set.startgg_set_id, reason })

    if (!set.question_id) {
      skip('no_market')
      continue
    }
    if (set.market_state === 'CHALLENGED') {
      skip('market_challenged')
      continue
    }
    if (set.market_state !== 'ACTIVE') {
      skip('market_not_active')
      continue
    }

    const questionId = set.question_id

    let resolution
    try {
      resolution = await publicClient.readContract({
        address: addresses.resolutionAdapter,
        abi: RESOLUTION_ADAPTER_ABI,
        functionName: 'resolutions',
        args: [questionId],
      })
    } catch (err) {
      log.error?.({ event: 'tick.read_resolution_failed', setId: set.startgg_set_id, message: String(err) })
      continue
    }

    const postedAt = resolution[2]
    const state = resolution[3]

    try {
      if (state === RESULT_STATE.NONE) {
        const winningIndex = deriveWinningIndex(set)
        if (winningIndex === null) {
          // Shouldn't happen given the db invariant (winner_startgg_id
          // is non-null for COMPLETED sets), but never guess a result.
          log.error?.({ event: 'tick.winner_mismatch', setId: set.startgg_set_id })
          continue
        }
        const resultRef = keccak256(toBytes(resultRefPreimage(set.startgg_set_id)))
        const hash = await walletClient.writeContract({
          address: addresses.resolutionAdapter,
          abi: RESOLUTION_ADAPTER_ABI,
          functionName: 'postResult',
          args: [questionId, winningIndex, resultRef],
        })
        await publicClient.waitForTransactionReceipt({ hash })
        result.posted++
      } else if (state === RESULT_STATE.PROPOSED) {
        const window = await readChallengeWindow()
        const elapsed = now >= Number(postedAt) + Number(window)
        if (!elapsed) {
          skip('window_open')
          continue
        }
        const hash = await walletClient.writeContract({
          address: addresses.resolutionAdapter,
          abi: RESOLUTION_ADAPTER_ABI,
          functionName: 'settle',
          args: [questionId],
        })
        await publicClient.waitForTransactionReceipt({ hash })
        result.settled++
      } else if (state === RESULT_STATE.DISPUTED) {
        skip('disputed')
      } else if (state === RESULT_STATE.SETTLED) {
        const isClaimed = await publicClient.readContract({
          address: addresses.houseBank,
          abi: HOUSE_BANK_ABI,
          functionName: 'claimed',
          args: [questionId],
        })
        if (isClaimed) {
          skip('already_claimed')
          continue
        }
        const hash = await walletClient.writeContract({
          address: addresses.houseBank,
          abi: HOUSE_BANK_ABI,
          functionName: 'claim',
          args: [questionId],
        })
        await publicClient.waitForTransactionReceipt({ hash })
        result.claimed++
      }
    } catch (err) {
      // Contract guards (AlreadyResolved/NotProposed/WindowNotElapsed/
      // AlreadyClaimed) are the backstop for a lost race; log and move
      // on to the next market rather than aborting the whole cycle.
      log.error?.({ event: 'tick.write_failed', setId: set.startgg_set_id, state, message: String(err) })
    }
  }

  return result
}
