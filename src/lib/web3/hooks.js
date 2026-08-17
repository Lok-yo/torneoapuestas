// wagmi-backed hooks for the on-chain prediction market UI. Reads mirror
// on-chain state directly (never the Supabase cache as an authority — see
// onchain-prediction-markets spec "Collateral remains on-chain"); the
// Supabase `onchain_markets`/`onchain_positions` read cache is used only
// for cheap *listing* (browsing many markets without N RPC calls), via
// src/repositories (not this file). See design.md "Interfaces" and
// specs onchain-prediction-markets / wallet-identity.
import { useMemo } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { MARKET_FACTORY_ABI, MARKET_FACTORY_ADDRESS, ERC20_ABI, USDC_ADDRESS, MARKET_STATE } from './contracts.js'

/**
 * Wallet connect/disconnect — thin wrapper over wagmi's connectors so UI
 * components never import wagmi directly (single seam for the whole web3
 * layer). See wallet-identity spec "User connects a wallet".
 */
export function useWalletConnect() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()

  return {
    address,
    isConnected,
    chainId: chain?.id,
    connectors,
    connect: (connector) => connect({ connector: connector ?? connectors[0] }),
    disconnect,
    isConnecting,
    connectError,
  }
}

/**
 * Reads a market's on-chain state by questionId directly from
 * MarketFactory — never from the Supabase cache, per
 * onchain-prediction-markets spec "Collateral remains on-chain" ("a
 * mirrored view only, with no ability to move the underlying USDC" —
 * extended here to mean the cache is never treated as authoritative for
 * a single market's live state either).
 */
export function useMarket(questionId) {
  const { data, isLoading, error, refetch } = useReadContract({
    address: MARKET_FACTORY_ADDRESS,
    abi: MARKET_FACTORY_ABI,
    functionName: 'markets',
    args: questionId ? [questionId] : undefined,
    query: { enabled: Boolean(questionId && MARKET_FACTORY_ADDRESS) },
  })

  const market = useMemo(() => {
    if (!data) return null
    const [conditionId, startggEventId, marketType, creator, fpmm, state, windowEnds, creationBond, challenger, challengeBond, challengedAt] = data
    return {
      conditionId,
      startggEventId,
      marketType,
      creator,
      fpmm,
      state,
      stateLabel: Object.keys(MARKET_STATE).find((key) => MARKET_STATE[key] === state) ?? 'UNKNOWN',
      windowEnds,
      creationBond,
      challenger,
      challengeBond,
      challengedAt,
    }
  }, [data])

  return { market, isLoading, error, refetch }
}

/**
 * Buy/sell flow: approve USDC (if needed) then call MarketFactory.buy /
 * .sell. Exposes a two-step status so the UI can show "approving" vs
 * "trading" — the actual pricing math never runs here, only in the
 * audited FPMM (design.md Decision 1).
 */
export function useTrade() {
  const { address } = useAccount()
  const { writeContractAsync: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract()
  const { writeContractAsync: writeTrade, data: tradeHash, isPending: isTrading } = useWriteContract()

  const { isLoading: isApproveConfirming } = useWaitForTransactionReceipt({ hash: approveHash })
  const { isLoading: isTradeConfirming } = useWaitForTransactionReceipt({ hash: tradeHash })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, MARKET_FACTORY_ADDRESS] : undefined,
    query: { enabled: Boolean(address && USDC_ADDRESS && MARKET_FACTORY_ADDRESS) },
  })

  async function ensureApproval(amount) {
    if (allowance !== undefined && allowance >= amount) return
    await writeApprove({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [MARKET_FACTORY_ADDRESS, amount],
    })
    await refetchAllowance()
  }

  async function buy({ questionId, investmentAmount, outcomeIndex, minOutcomeTokensToBuy = 0n }) {
    await ensureApproval(investmentAmount)
    return writeTrade({
      address: MARKET_FACTORY_ADDRESS,
      abi: MARKET_FACTORY_ABI,
      functionName: 'buy',
      args: [questionId, investmentAmount, outcomeIndex, minOutcomeTokensToBuy],
    })
  }

  // Selling requires ctf.setApprovalForAll(MarketFactory, true) once per
  // wallet — a separate one-time ERC-1155 approval, not USDC allowance.
  // See contracts/src/MarketFactory.sol `sell()` NatSpec.
  async function sell({ questionId, returnAmount, outcomeIndex, maxOutcomeTokensToSell }) {
    return writeTrade({
      address: MARKET_FACTORY_ADDRESS,
      abi: MARKET_FACTORY_ABI,
      functionName: 'sell',
      args: [questionId, returnAmount, outcomeIndex, maxOutcomeTokensToSell],
    })
  }

  return {
    buy,
    sell,
    isPending: isApproving || isTrading || isApproveConfirming || isTradeConfirming,
    tradeHash,
  }
}

/** Permissionless market creation (proposal.md "market creation:
 * permissionless"). Pulls CREATION_BOND + seedLiquidity USDC via
 * MarketFactory.createMarket after ensuring allowance. */
export function useCreateMarket() {
  const { writeContractAsync: writeApprove } = useWriteContract()
  const { writeContractAsync: writeCreate, data: createHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: createHash })

  async function createMarket({ questionId, startggEventId, marketType, seedLiquidity, eventStartsAt, totalApproval }) {
    await writeApprove({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [MARKET_FACTORY_ADDRESS, totalApproval],
    })
    return writeCreate({
      address: MARKET_FACTORY_ADDRESS,
      abi: MARKET_FACTORY_ABI,
      functionName: 'createMarket',
      args: [questionId, startggEventId, marketType, seedLiquidity, eventStartsAt],
    })
  }

  return { createMarket, isPending: isPending || isConfirming, createHash }
}
