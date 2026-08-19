// event-indexer: mirrors on-chain MarketFactory/ResolutionAdapter/CTF
// state into Supabase's read cache (onchain_markets/onchain_positions/
// creation_bonds), never the source of truth (onchain-prediction-markets
// spec "Collateral remains on-chain"). Cron-invoked on a short interval.
// Reads only up to `latest - REORG_DEPTH` blocks and upserts by
// (block_number, log_index) — see reorgGuard.ts (unit-tested separately,
// reorg.test.ts / tasks.md 2.4).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createPublicClient, http, parseAbiItem } from 'https://esm.sh/viem@2?bundle'
import { polygonAmoy } from 'https://esm.sh/viem@2/chains?bundle'
import { log, newRequestId } from '../_shared/log.js'
import { filterReorgSafeLogs, nextUnprocessedLogs } from './reorgGuard.ts'
import { matchStartggSetId } from './setMatcher.ts'

const MARKET_CREATED_EVENT = parseAbiItem(
  'event MarketCreated(bytes32 indexed questionId, bytes32 indexed conditionId, address indexed creator, address fpmm, uint256 startggEventId, uint8 marketType)',
)
const MARKET_ACTIVATED_EVENT = parseAbiItem('event MarketActivated(bytes32 indexed questionId)')
const MARKET_CHALLENGED_EVENT = parseAbiItem('event MarketChallenged(bytes32 indexed questionId, address indexed challenger)')
const MARKET_VOIDED_EVENT = parseAbiItem('event MarketVoided(bytes32 indexed questionId)')
const CREATION_RULED_EVENT = parseAbiItem('event CreationRuled(bytes32 indexed questionId, bool upheld)')
// Position-balance cache is driven off MarketFactory's own SharesBought/
// SharesSold events (rather than raw CTF ERC-1155 Transfer logs) — both
// already carry questionId + trader + outcomeIndex, which is exactly what
// onchain_positions needs, without indexing a second contract.
const SHARES_BOUGHT_EVENT = parseAbiItem(
  'event SharesBought(bytes32 indexed questionId, address indexed trader, uint256 outcomeIndex, uint256 investmentAmount, uint256 outcomeTokens)',
)
const SHARES_SOLD_EVENT = parseAbiItem(
  'event SharesSold(bytes32 indexed questionId, address indexed trader, uint256 outcomeIndex, uint256 returnAmount)',
)
const CTF_BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'positionId', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const
const CTF_ID_HELPERS_ABI = [
  {
    type: 'function',
    name: 'getCollectionId',
    stateMutability: 'view',
    inputs: [
      { name: 'parentCollectionId', type: 'bytes32' },
      { name: 'conditionId', type: 'bytes32' },
      { name: 'indexSet', type: 'uint256' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'getPositionId',
    stateMutability: 'view',
    inputs: [
      { name: 'collateralToken', type: 'address' },
      { name: 'collectionId', type: 'bytes32' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const

Deno.serve(async (req) => {
  const requestId = newRequestId()

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const rpcUrl = Deno.env.get('AMOY_RPC_URL')
  const marketFactoryAddress = Deno.env.get('MARKET_FACTORY_ADDRESS')
  const cronSecret = Deno.env.get('INDEXER_CRON_SECRET')

  if (!supabaseUrl || !serviceRoleKey || !rpcUrl || !marketFactoryAddress) {
    log.error({ requestId, event: 'event_indexer.misconfigured' })
    return new Response(JSON.stringify({ error: 'UNAVAILABLE' }), { status: 503 })
  }

  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'FORBIDDEN' }), { status: 403 })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
  const client = createPublicClient({ chain: polygonAmoy, transport: http(rpcUrl) })

  const { data: cursorRow } = await supabase
    .from('onchain_events_cursor')
    .select('*')
    .eq('contract_address', marketFactoryAddress)
    .maybeSingle()

  const cursor = {
    lastBlock: BigInt(cursorRow?.last_block ?? 0),
    lastLogIndex: cursorRow?.last_log_index ?? -1,
  }

  const latestBlock = await client.getBlockNumber()

  const rawLogs = await client.getLogs({
    address: marketFactoryAddress as `0x${string}`,
    events: [
      MARKET_CREATED_EVENT,
      MARKET_ACTIVATED_EVENT,
      MARKET_CHALLENGED_EVENT,
      MARKET_VOIDED_EVENT,
      CREATION_RULED_EVENT,
      SHARES_BOUGHT_EVENT,
      SHARES_SOLD_EVENT,
    ],
    fromBlock: cursor.lastBlock,
    toBlock: latestBlock,
  })

  const safeLogs = filterReorgSafeLogs(
    rawLogs.map((l) => ({ ...l, blockNumber: l.blockNumber ?? 0n, logIndex: l.logIndex ?? 0 })),
    latestBlock,
  )

  const { toProcess, advanceTo } = nextUnprocessedLogs(safeLogs, cursor)

  const ctfAddress = Deno.env.get('CTF_ADDRESS')
  const usdcAddress = Deno.env.get('USDC_ADDRESS')

  let upserts = 0
  for (const evt of toProcess) {
    try {
      await applyEvent(supabase, evt)
      if ((evt.eventName === 'SharesBought' || evt.eventName === 'SharesSold') && ctfAddress && usdcAddress) {
        await refreshPositionBalance(client, supabase, ctfAddress, usdcAddress, evt)
      }
      upserts++
    } catch (err) {
      log.error({ requestId, event: 'event_indexer.apply_failed', logEvent: evt.eventName, message: String(err) })
    }
  }

  if (toProcess.length > 0) {
    await supabase.from('onchain_events_cursor').upsert({
      contract_address: marketFactoryAddress,
      last_block: Number(advanceTo.lastBlock),
      last_log_index: advanceTo.lastLogIndex,
    })
  }

  log.info({ requestId, event: 'event_indexer.cycle_complete', latestBlock: latestBlock.toString(), processed: toProcess.length, upserts })

  return new Response(
    JSON.stringify({ status: 'ok', latestBlock: latestBlock.toString(), processed: toProcess.length, upserts }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )
})

// deno-lint-ignore no-explicit-any
async function applyEvent(supabase: ReturnType<typeof createClient>, evt: any) {
  const questionId = evt.args?.questionId as string | undefined
  const conditionId = evt.args?.conditionId as string | undefined

  switch (evt.eventName) {
    case 'MarketCreated': {
      const startggEventId = Number(evt.args?.startggEventId ?? 0)
      const marketType = Number(evt.args?.marketType ?? 0)
      await supabase.from('onchain_markets').upsert({
        condition_id: conditionId,
        question_id: questionId,
        startgg_event_id: startggEventId,
        market_type: marketType,
        creator_address: evt.args?.creator,
        state: 'PENDING',
        fpmm_address: evt.args?.fpmm,
        block_number: Number(evt.blockNumber),
        log_index: evt.logIndex,
      })
      await supabase.from('creation_bonds').upsert({
        question_id: questionId,
        creator: evt.args?.creator,
        amount: 25_000_000, // 25 USDC, 6 decimals — mirrors MarketFactory.CREATION_BOND
        state: 'LOCKED',
      })
      // keccak is one-way, so the set key is recovered by recomputing
      // candidate questionIds from the event's ingested sets (design.md
      // "Identity" / tasks.md 2.5). Non-set markets (marketType=1) and
      // unmatched events stay NULL — question ids cannot be reversed.
      if (questionId) {
        const { data: candidateSets } = await supabase
          .from('tournament_sets')
          .select('startgg_set_id')
          .eq('startgg_event_id', startggEventId)
        const matchedSetId = matchStartggSetId(
          questionId,
          startggEventId,
          marketType,
          (candidateSets ?? []).map((row: { startgg_set_id: number }) => row.startgg_set_id),
        )
        if (matchedSetId != null) {
          await supabase
            .from('onchain_markets')
            .update({ startgg_set_id: Number(matchedSetId) })
            .eq('question_id', questionId)
        }
      }
      break
    }
    case 'MarketActivated':
      await supabase.from('onchain_markets').update({ state: 'ACTIVE' }).eq('question_id', questionId)
      break
    case 'MarketChallenged':
      await supabase.from('onchain_markets').update({ state: 'CHALLENGED' }).eq('question_id', questionId)
      await supabase.from('creation_bonds').update({ state: 'CHALLENGED', challenger: evt.args?.challenger }).eq('question_id', questionId)
      break
    case 'MarketVoided':
      await supabase.from('onchain_markets').update({ state: 'VOID' }).eq('question_id', questionId)
      break
    case 'CreationRuled':
      await supabase
        .from('creation_bonds')
        .update({ state: evt.args?.upheld ? 'SLASHED' : 'REFUNDED', ruled_at: new Date().toISOString() })
        .eq('question_id', questionId)
      break
    default:
      break
  }
}

/** After a SharesBought/SharesSold event, re-reads the trader's actual
 * CTF position balance for that outcome and upserts onchain_positions —
 * a read-through refresh rather than incrementally tracking deltas, so
 * the cache self-heals from any missed event instead of drifting. */
// deno-lint-ignore no-explicit-any
async function refreshPositionBalance(
  client: ReturnType<typeof createPublicClient>,
  supabase: ReturnType<typeof createClient>,
  ctfAddress: string,
  usdcAddress: string,
  evt: any,
) {
  const { data: market } = await supabase
    .from('onchain_markets')
    .select('condition_id')
    .eq('question_id', evt.args.questionId)
    .maybeSingle()
  if (!market) return

  const outcomeIndex = Number(evt.args.outcomeIndex ?? 0)
  const indexSet = outcomeIndex === 0 ? 1n : 2n

  const collectionId = await client.readContract({
    address: ctfAddress as `0x${string}`,
    abi: CTF_ID_HELPERS_ABI,
    functionName: 'getCollectionId',
    args: ['0x' + '0'.repeat(64), market.condition_id as `0x${string}`, indexSet],
  })
  const positionId = await client.readContract({
    address: ctfAddress as `0x${string}`,
    abi: CTF_ID_HELPERS_ABI,
    functionName: 'getPositionId',
    args: [usdcAddress as `0x${string}`, collectionId as `0x${string}`],
  })
  const balance = await client.readContract({
    address: ctfAddress as `0x${string}`,
    abi: CTF_BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [evt.args.trader as `0x${string}`, positionId as bigint],
  })

  await supabase.from('onchain_positions').upsert({
    condition_id: market.condition_id,
    holder_address: evt.args.trader,
    position_id: (positionId as bigint).toString(),
    balance: (balance as bigint).toString(),
  })
}
