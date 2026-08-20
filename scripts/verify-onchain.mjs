import { readFileSync } from 'node:fs'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygonAmoy } from 'viem/chains'
import { keccak256, encodeAbiParameters, toBytes } from 'viem'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const rpcUrl = 'http://127.0.0.1:8545'
const account = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80')
const transport = http(rpcUrl)
const publicClient = createPublicClient({ chain: polygonAmoy, transport })
const walletClient = createWalletClient({ account, chain: polygonAmoy, transport })

const factory = env.VITE_MARKET_FACTORY_ADDRESS
const usdc = env.VITE_USDC_ADDRESS
const factoryAbi = parseAbi([
  'function registerStartggEvent(uint256 startggEventId)',
  'function createMarket(bytes32 questionId, uint256 startggEventId, uint8 marketType, uint256 seedLiquidity, uint256 eventStartsAt) returns (bytes32)',
  'function activateIfUnchallenged(bytes32 questionId)',
  'function buy(bytes32 questionId, uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy)',
  'function markets(bytes32) view returns (bytes32, uint256, uint8, address, address, uint8, uint256, uint256, address, uint256, uint256)',
])
const erc20Abi = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
])

function matchQuestionId(eventId, setId) {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'uint8' }, { type: 'bytes32' }],
      [BigInt(eventId), 0, keccak256(toBytes(`set:${setId}`))],
    ),
  )
}

const res = await fetch(
  `${env.VITE_SUPABASE_URL}/rest/v1/public_tournament_sets_view?select=startgg_set_id,startgg_event_id,entrant_a_name,entrant_b_name&entrant_a_name=not.is.null&entrant_b_name=not.is.null&limit=1`,
  { headers: { apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}` } },
)
const sets = await res.json()
if (!Array.isArray(sets) || sets.length === 0) {
  console.error('NO_SETS', sets)
  process.exit(1)
}
const set = sets[0]
console.log('SET', set)

const eventId = BigInt(set.startgg_event_id)
const questionId = matchQuestionId(set.startgg_event_id, set.startgg_set_id)
console.log('QUESTION', questionId)

const before = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'markets', args: [questionId] })
console.log('STATE_BEFORE', Number(before[5]))

if (Number(before[5]) === 0) {
  await walletClient.writeContract({ address: factory, abi: factoryAbi, functionName: 'registerStartggEvent', args: [eventId] })
  console.log('REGISTERED')
  const total = 101_000_000n
  await walletClient.writeContract({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [factory, total] })
  const startsAt = BigInt(Math.floor(Date.now() / 1000) + 7200)
  await walletClient.writeContract({
    address: factory,
    abi: factoryAbi,
    functionName: 'createMarket',
    args: [questionId, eventId, 0, 100_000_000n, startsAt],
  })
  console.log('CREATED')
} else {
  console.log('MARKET_ALREADY_EXISTS')
}

async function rpc(method, params) {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return (await res.json()).result
}
const latest = await rpc('eth_getBlockByNumber', ['latest', false])
const ts = Number(latest.timestamp)
await rpc('evm_setNextBlockTimestamp', [ts + 3660])
await rpc('evm_mine', [])
await walletClient.writeContract({ address: factory, abi: factoryAbi, functionName: 'activateIfUnchallenged', args: [questionId] })
console.log('ACTIVATED')

await walletClient.writeContract({ address: usdc, abi: erc20Abi, functionName: 'approve', args: [factory, 10_000_000n] })
await walletClient.writeContract({
  address: factory,
  abi: factoryAbi,
  functionName: 'buy',
  args: [questionId, 10_000_000n, 0n, 0n],
})
console.log('BOUGHT')

const after = await publicClient.readContract({ address: factory, abi: factoryAbi, functionName: 'markets', args: [questionId] })
const usdcBal = await publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] })
console.log('STATE_AFTER', Number(after[5]), 'ACTIVE_SHOULD_BE_3')
console.log('USDC_LEFT', usdcBal.toString())
