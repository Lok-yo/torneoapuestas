import { createPublicClient, http, parseAbiItem } from 'viem'
import { polygonAmoy } from 'viem/chains'
import { HOUSE_BANK_ADDRESS, HOUSE_BANK_ABI, isHouseConfigured } from './contracts.js'
import { fetchSetCatalog, pickName, resolveQuestion } from './marketLabels.js'

const BET_PLACED = parseAbiItem(
  'event BetPlaced(address indexed user, bytes32 indexed questionId, bytes32 indexed accountId, uint256 outcomeIndex, uint256 amount)',
)

function mapBet(log, catalog, { questionId, outcomeIndex, amount, trader }) {
  const meta = resolveQuestion(questionId, catalog)
  return {
    questionId,
    trader,
    outcomeIndex,
    investmentAmount: amount,
    outcomeTokens: amount,
    blockNumber: log.blockNumber,
    txHash: log.transactionHash,
    matchup: meta?.matchup ?? null,
    pick: pickName(meta, outcomeIndex),
    playerA: meta?.playerA ?? null,
    playerB: meta?.playerB ?? null,
  }
}

export async function fetchOnchainBets(address, accountId) {
  if (!address || !accountId) return []
  const rpc = import.meta.env.VITE_AMOY_RPC_URL || undefined
  const client = createPublicClient({
    chain: polygonAmoy,
    transport: http(rpc),
  })
  const catalog = await fetchSetCatalog()
  let latest = 0n
  try {
    latest = await client.getBlockNumber()
  } catch {
    return []
  }
  const fromBlock = latest > 20_000n ? latest - 20_000n : 0n
  const range = { fromBlock, toBlock: 'latest' }

  const houseLogs = isHouseConfigured
    ? await client
        .getLogs({
          address: HOUSE_BANK_ADDRESS,
          event: BET_PLACED,
          args: { user: address, accountId },
          ...range,
        })
        .catch(() => [])
    : []

  const fromHouse = houseLogs.map((log) =>
    mapBet(log, catalog, {
      questionId: log.args.questionId,
      outcomeIndex: Number(log.args.outcomeIndex),
      amount: log.args.amount,
      trader: log.args.user,
    }),
  )

  const blockIds = [...new Set(fromHouse.map((b) => b.blockNumber.toString()))]
  const times = {}
  await Promise.all(
    blockIds.map(async (bn) => {
      try {
        const block = await client.getBlock({ blockNumber: BigInt(bn) })
        times[bn] = Number(block.timestamp) * 1000
      } catch {
        times[bn] = 0
      }
    }),
  )

  const windows = {}
  const uniqueQ = [...new Set(fromHouse.map((b) => b.questionId))]
  await Promise.all(
    uniqueQ.map(async (questionId) => {
      try {
        const row = await client.readContract({
          address: HOUSE_BANK_ADDRESS,
          abi: HOUSE_BANK_ABI,
          functionName: 'cancelWindowOf',
          args: [questionId, address, accountId],
        })
        windows[questionId] = {
          amount: Array.isArray(row) ? row[0] : row.amount,
          deadline: Number(Array.isArray(row) ? row[1] : row.deadline) * 1000,
        }
      } catch {
        windows[questionId] = { amount: 0n, deadline: 0 }
      }
    }),
  )

  return fromHouse
    .map((bet) => ({
      ...bet,
      placedAt: times[bet.blockNumber.toString()] || 0,
      cancelAmount: windows[bet.questionId]?.amount ?? 0n,
      cancelDeadline: windows[bet.questionId]?.deadline ?? 0,
    }))
    .sort((a, b) => Number(b.blockNumber - a.blockNumber))
}
