#!/usr/bin/env node
// Local settlement loop — runs runTick() every SETTLEMENT_INTERVAL_MS
// (default 15s) directly against the local Anvil node via viem. This is
// TODAY'S ONLY settlement path: Supabase cloud Edge Functions cannot
// reach 127.0.0.1:8545 (see design.md "Local Execution Mode" /
// "local loop talks to Anvil directly; it does NOT call the Supabase
// relayer"). VPS day: runTick() moves unchanged into
// supabase/functions/settlement-tick/index.ts, wrapped by
// `Deno.serve` + pg_cron instead of this interval — see
// supabase/deploy/settlement-tick-cron.sql.
//
// This file is intentionally thin wiring (env -> clients -> db adapter ->
// runTick loop) with no branching logic of its own, so it is verified by
// manual E2E (npm run settle:loop against local Anvil + a demo COMPLETED
// set) rather than a unit test — see design.md "Testing Strategy": only
// runTick's state machine and deriveWinningIndex/resultRefPreimage are
// unit-tested; this file's job is real client/DB construction, which a
// mocked unit test would not meaningfully exercise. tasks.md 3.3.

import { createClient } from '@supabase/supabase-js'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygonAmoy } from 'viem/chains'
import { loadEnvLocal } from './_env.mjs'
import { runTick } from './settlement/tick.mjs'
import { matchQuestionId } from '../src/lib/web3/questionId.js'

const RESOLUTION_ADAPTER_RELAYER_ABI = parseAbi(['function relayer() view returns (address)'])

const REQUIRED_ENV_KEYS = [
  'VITE_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_AMOY_RPC_URL',
  'VITE_RESOLUTION_ADAPTER_ADDRESS',
  'VITE_HOUSE_BANK_ADDRESS',
  'RELAYER_PRIVATE_KEY',
]

function assertRequiredEnv(env) {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(`settlement-loop: missing required .env.local keys: ${missing.join(', ')}`)
  }
}

/** Builds the `db` adapter runTick expects.
 *
 * IMPORTANT local-only fallback: `onchain_markets` is populated by
 * `event-indexer` listening to MarketFactory chain events — another
 * Supabase cloud Edge Function that cannot reach a local Anvil node
 * (same network wall as the relayer, see design.md). So locally,
 * `onchain_markets` stays empty and every set would otherwise skip with
 * `no_market`. Since `question_id` is a pure deterministic hash of
 * `(startgg_event_id, startgg_set_id)` — the exact same formula the
 * frontend uses to place the bet in the first place (src/lib/web3/
 * questionId.js `matchQuestionId`, used by CreateMarketPage/MatchCard) —
 * we recompute it here instead of reading the (empty) cache. This
 * sidesteps the missing cache entirely; no on-chain read needed for the
 * id itself, only for its resolution state (tick.mjs does that).
 * `market_state` is not checked here (VOID/CHALLENGED-as-a-market is a
 * MarketFactory-level concept, distinct from ResolutionAdapter's own
 * DISPUTED result state that tick.mjs already reads live) — an
 * acceptable simplification for today's local demo path; the
 * cloud/VPS path (Supabase cron + populated onchain_markets) keeps the
 * real state.state check once event-indexer can actually reach the chain. */
function makeDb(supabase) {
  return {
    async fetchEligibleSets() {
      const { data: sets, error: setsError } = await supabase
        .from('tournament_sets')
        .select('startgg_set_id, startgg_event_id, entrant_a_startgg_id, entrant_b_startgg_id, winner_startgg_id')
        .eq('state', 'COMPLETED')
        .not('winner_startgg_id', 'is', null)

      if (setsError) throw setsError
      if (!sets || sets.length === 0) return []

      return sets.map((set) => ({
        ...set,
        question_id: matchQuestionId(set.startgg_event_id, set.startgg_set_id),
        market_state: 'ACTIVE',
      }))
    },
  }
}

async function assertRelayerMatches(publicClient, resolutionAdapterAddress, signerAddress) {
  const onChainRelayer = await publicClient.readContract({
    address: resolutionAdapterAddress,
    abi: RESOLUTION_ADAPTER_RELAYER_ABI,
    functionName: 'relayer',
  })
  if (onChainRelayer.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(
      `settlement-loop: RELAYER_PRIVATE_KEY signs as ${signerAddress}, but ResolutionAdapter.relayer() is ${onChainRelayer}. Refusing to start — see DeployLocal.s.sol for the registered relayer key.`,
    )
  }
}

async function main() {
  const env = loadEnvLocal()
  assertRequiredEnv(env)

  const transport = http(env.VITE_AMOY_RPC_URL)
  const publicClient = createPublicClient({ chain: polygonAmoy, transport })
  const account = privateKeyToAccount(env.RELAYER_PRIVATE_KEY)
  const walletClient = createWalletClient({ account, chain: polygonAmoy, transport })

  const addresses = {
    resolutionAdapter: env.VITE_RESOLUTION_ADAPTER_ADDRESS,
    houseBank: env.VITE_HOUSE_BANK_ADDRESS,
  }

  await assertRelayerMatches(publicClient, addresses.resolutionAdapter, account.address)

  const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const db = makeDb(supabase)

  const intervalMs = Number(env.SETTLEMENT_INTERVAL_MS ?? 15000)

  const tick = async () => {
    try {
      // CHALLENGE_WINDOW elapsed-check must compare against the CHAIN's
      // own clock, not the host machine's wall clock: dev-fast-forward.mjs
      // advances Anvil's block timestamp independently of real time (that
      // is the whole point — demoing settle() without a real 4h wait), so
      // using Date.now() here would never see that jump and every set
      // would stay stuck on window_open forever.
      const block = await publicClient.getBlock()
      const result = await runTick({ db, publicClient, walletClient, addresses, now: Number(block.timestamp) })
      console.log(JSON.stringify({ event: 'settlement-loop.tick', ...result }))
    } catch (err) {
      console.error(JSON.stringify({ event: 'settlement-loop.tick_failed', message: String(err) }))
    }
  }

  console.log(
    JSON.stringify({ event: 'settlement-loop.started', signer: account.address, rpcUrl: env.VITE_AMOY_RPC_URL, intervalMs }),
  )
  await tick()
  setInterval(tick, intervalMs)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(JSON.stringify({ event: 'settlement-loop.fatal', message: String(err) }))
    process.exit(1)
  })
}
