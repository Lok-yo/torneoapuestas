import { createPublicClient, http, parseAbiItem } from 'viem'
import { polygonAmoy } from 'viem/chains'
import { HOUSE_BANK_ADDRESS, HOUSE_BANK_ABI, isHouseConfigured } from './contracts.js'
import { fetchSetCatalog, pickName, resolveQuestion } from './marketLabels.js'
import { remainingCancelMs, CANCEL_MS, expireCancelWindow } from './cancelWindow.js'
import { housePlayerId } from './accountId.js'

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
  let chainNowSec = 0
  try {
    const latestBlock = await client.getBlock({ blockTag: 'latest' })
    latest = latestBlock.number
    chainNowSec = Number(latestBlock.timestamp)
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

  const pid = housePlayerId(address, accountId)
  const openStake = {}
  if (pid && isHouseConfigured) {
    const uniqueQ = [...new Set(fromHouse.map((b) => b.questionId))]
    await Promise.all(
      uniqueQ.map(async (questionId) => {
        try {
          const [s0, s1] = await Promise.all([
            client.readContract({
              address: HOUSE_BANK_ADDRESS,
              abi: HOUSE_BANK_ABI,
              functionName: 'userStake',
              args: [questionId, pid, 0n],
            }),
            client.readContract({
              address: HOUSE_BANK_ADDRESS,
              abi: HOUSE_BANK_ABI,
              functionName: 'userStake',
              args: [questionId, pid, 1n],
            }),
          ])
          openStake[questionId] = (s0 ?? 0n) + (s1 ?? 0n)
        } catch {
          openStake[questionId] = null
        }
      }),
    )
  }

  const fetchedAt = Date.now()
  return fromHouse
    .map((bet) => {
      const placedAt = times[bet.blockNumber.toString()] || 0
      const placedAtSec = placedAt > 0 ? placedAt / 1000 : 0
      const cancelled = openStake[bet.questionId] === 0n
      if (cancelled) expireCancelWindow(bet.txHash)
      const chainLeft = cancelled || !placedAtSec
        ? 0
        : Math.max(0, (placedAtSec + CANCEL_MS / 1000 - chainNowSec) * 1000)
      const remaining = cancelled ? 0 : remainingCancelMs(bet.txHash, chainLeft)
      return {
        ...bet,
        placedAt,
        cancelled,
        cancelAmount: remaining > 0 ? bet.investmentAmount : 0n,
        cancelDeadline: fetchedAt + remaining,
        cancelRemainingMs: remaining,
        fetchedAt,
      }
    })
    .sort((a, b) => Number(b.blockNumber - a.blockNumber))
}
