// wagmi-backed hooks for the on-chain prediction market UI. Reads mirror
// on-chain state directly (never the Supabase cache as an authority — see
// onchain-prediction-markets spec "Collateral remains on-chain"); the
// Supabase `onchain_markets`/`onchain_positions` read cache is used only
// for cheap *listing* (browsing many markets without N RPC calls), via
// src/repositories (not this file). See design.md "Interfaces" and
// specs onchain-prediction-markets / wallet-identity.
import { useMemo, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { readContract, getAccount } from 'wagmi/actions'
import { wagmiConfig, AMOY_CHAIN_ID, AMOY_ADD_CHAIN } from './client.js'
import { sendWalletTx, sendMetaMaskCall } from './sendTx.js'
import { isLocalAnvil, registerStartggEvent, createLocalMarket } from './localDev.js'
import { useSession } from '../../auth/SessionProvider.jsx'
import { sessionAccountId, housePlayerId } from './accountId.js'
import {
  MARKET_FACTORY_ABI,
  MARKET_FACTORY_ADDRESS,
  ERC20_ABI,
  USDC_ADDRESS,
  MARKET_STATE,
  HOUSE_BANK_ABI,
  HOUSE_BANK_ADDRESS,
  isHouseConfigured,
} from './contracts.js'

/**
 * Wallet connect/disconnect — thin wrapper over wagmi's connectors so UI
 * components never import wagmi directly (single seam for the whole web3
 * layer). See wallet-identity spec "User connects a wallet".
 */
function uniqueConnectors(connectors) {
  const list = connectors ?? []
  const names = list.map((c) => String(c.name || '').toLowerCase())
  const hasBrand = names.some((n) => n.includes('metamask') || n.includes('rabby') || n.includes('coinbase'))
  const seen = new Set()
  return list.filter((c) => {
    const n = String(c.name || '').toLowerCase()
    if (hasBrand && n === 'injected') return false
    if (seen.has(n)) return false
    seen.add(n)
    return true
  })
}

export function useWalletConnect() {
  const { address, isConnected, chain } = useAccount()
  const { connect, connectors, isPending: isConnecting, error: connectError } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()
  const wallets = uniqueConnectors(connectors)

  return {
    address,
    isConnected,
    chainId: chain?.id,
    isCorrectChain: chain?.id === AMOY_CHAIN_ID,
    connectors: wallets,
    connect: (connector) => connect({ connector: connector ?? wallets[0] }),
    disconnect,
    switchToAmoy: () =>
      switchChain({
        chainId: AMOY_CHAIN_ID,
        addEthereumChainParameter: AMOY_ADD_CHAIN,
      }),
    isConnecting: isConnecting || isSwitching,
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
  const { writeContractAsync, data: tradeHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: tradeHash })

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, MARKET_FACTORY_ADDRESS] : undefined,
    query: { enabled: Boolean(address && USDC_ADDRESS && MARKET_FACTORY_ADDRESS) },
  })

  async function ensureApproval(amount) {
    if (allowance !== undefined && allowance >= amount) return
    await sendWalletTx(writeContractAsync, {
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [MARKET_FACTORY_ADDRESS, amount],
    })
    await refetchAllowance()
  }

  async function buy({ questionId, investmentAmount, outcomeIndex, minOutcomeTokensToBuy = 0n }) {
    await ensureApproval(investmentAmount)
    return sendWalletTx(writeContractAsync, {
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
    return sendWalletTx(writeContractAsync, {
      address: MARKET_FACTORY_ADDRESS,
      abi: MARKET_FACTORY_ABI,
      functionName: 'sell',
      args: [questionId, returnAmount, outcomeIndex, maxOutcomeTokensToSell],
    })
  }

  return {
    buy,
    sell,
    isPending: isPending || isConfirming,
    tradeHash,
  }
}

/** Permissionless market creation (proposal.md "market creation:
 * permissionless"). Pulls CREATION_BOND + seedLiquidity USDC via
 * MarketFactory.createMarket after ensuring allowance. */
export function useCreateMarket() {
  const { writeContractAsync, data: createHash } = useWriteContract()
  const [isPending, setIsPending] = useState(false)

  async function createMarket({ questionId, startggEventId, marketType, seedLiquidity, eventStartsAt, totalApproval }) {
    setIsPending(true)
    try {
      const { address } = getAccount(wagmiConfig)
      if (!address) throw new Error('Conecta la wallet.')

      let known = await readContract(wagmiConfig, {
        address: MARKET_FACTORY_ADDRESS,
        abi: MARKET_FACTORY_ABI,
        functionName: 'knownStartggEvents',
        args: [startggEventId],
      })
      if (!known && isLocalAnvil()) {
        await registerStartggEvent(startggEventId)
        known = await readContract(wagmiConfig, {
          address: MARKET_FACTORY_ADDRESS,
          abi: MARKET_FACTORY_ABI,
          functionName: 'knownStartggEvents',
          args: [startggEventId],
        })
      }
      if (!known) {
        throw new Error('UnknownStartggEvent')
      }

      const existing = await readContract(wagmiConfig, {
        address: MARKET_FACTORY_ADDRESS,
        abi: MARKET_FACTORY_ABI,
        functionName: 'markets',
        args: [questionId],
      })
      const state = Number(Array.isArray(existing) ? existing[5] : existing?.state ?? 0)
      if (state !== 0) {
        throw new Error('MarketAlreadyExists')
      }

      if (!isHouseConfigured) {
        throw new Error('La casa no está desplegada.')
      }

      if (isLocalAnvil()) {
        const result = await createLocalMarket({
          address,
          questionId,
          startggEventId,
          marketType,
          seedLiquidity,
          eventStartsAt,
        })
        return result.txHash
      }

      return await sendWalletTx(writeContractAsync, {
        address: HOUSE_BANK_ADDRESS,
        abi: HOUSE_BANK_ABI,
        functionName: 'createMarket',
        args: [questionId, startggEventId, Number(marketType), seedLiquidity, eventStartsAt],
        gas: 8_000_000n,
      })
    } finally {
      setIsPending(false)
    }
  }

  return { createMarket, isPending, createHash }
}

const EMPTY_HOUSE_ACCOUNT = { balance: 0n, deposited: 0n, inPlay: 0n, withdrawable: 0n }

function useSessionAccountId() {
  const { session } = useSession()
  return sessionAccountId(session?.user?.id)
}

async function houseWrite(writeContractAsync, request, extra) {
  if (isLocalAnvil()) return sendMetaMaskCall(request, extra)
  return sendWalletTx(writeContractAsync, request, extra)
}

async function waitForHouseCredit(address, accountId, before) {
  for (let i = 0; i < 20; i++) {
    try {
      const row = await readContract(wagmiConfig, {
        address: HOUSE_BANK_ADDRESS,
        abi: HOUSE_BANK_ABI,
        functionName: 'accountOf',
        args: [address, accountId],
      })
      const bal = Array.isArray(row) ? row[0] : row.balance
      if (bal > before) return true
    } catch {
      // rpc hiccup
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  return false
}

/** House bankroll: deposited principal is locked; only profits cash out. */
export function useHouseAccount() {
  const { address } = useAccount()
  const accountId = useSessionAccountId()
  const { data, isLoading, error, refetch } = useReadContract({
    address: HOUSE_BANK_ADDRESS,
    abi: HOUSE_BANK_ABI,
    functionName: 'accountOf',
    args: address && accountId ? [address, accountId] : undefined,
    query: { enabled: Boolean(address && accountId && isHouseConfigured) },
  })

  const account = useMemo(() => {
    if (!data) return EMPTY_HOUSE_ACCOUNT
    const row = Array.isArray(data) ? data : [data.balance, data.deposited, data.inPlay, data.withdrawable]
    return {
      balance: row[0] ?? 0n,
      deposited: row[1] ?? 0n,
      inPlay: row[2] ?? 0n,
      withdrawable: row[3] ?? 0n,
    }
  }, [data])

  return { account, isLoading, error, refetch }
}

export function useAddFunds() {
  const { writeContractAsync } = useWriteContract()
  const [isPending, setIsPending] = useState(false)
  const accountId = useSessionAccountId()

  async function addFunds(amount) {
    if (!isHouseConfigured) throw new Error('La casa no está desplegada.')
    if (!accountId) throw new Error('Necesitas iniciar sesión con Google.')
    const { address } = getAccount(wagmiConfig)
    if (!address) throw new Error('Conecta la wallet.')
    const beforeRow = await readContract(wagmiConfig, {
      address: HOUSE_BANK_ADDRESS,
      abi: HOUSE_BANK_ABI,
      functionName: 'accountOf',
      args: [address, accountId],
    })
    const before = Array.isArray(beforeRow) ? beforeRow[0] : beforeRow.balance
    setIsPending(true)
    try {
      await houseWrite(writeContractAsync, {
        address: HOUSE_BANK_ADDRESS,
        abi: HOUSE_BANK_ABI,
        functionName: 'addFunds',
        args: [amount, accountId],
      })
      const credited = await waitForHouseCredit(address, accountId, before)
      if (!credited) {
        throw new Error('La recarga se envió. Si el saldo no sube en unos segundos, recarga la página.')
      }
    } finally {
      setIsPending(false)
    }
  }

  return { addFunds, isPending }
}

export function useWithdrawProfits() {
  const { writeContractAsync } = useWriteContract()
  const [isPending, setIsPending] = useState(false)
  const accountId = useSessionAccountId()

  async function withdrawProfits(amount) {
    if (!isHouseConfigured) throw new Error('La casa no está desplegada.')
    if (!accountId) throw new Error('Necesitas iniciar sesión con Google.')
    const { address } = getAccount(wagmiConfig)
    if (!address) throw new Error('Conecta la wallet.')
    setIsPending(true)
    try {
      return await houseWrite(writeContractAsync, {
        address: HOUSE_BANK_ADDRESS,
        abi: HOUSE_BANK_ABI,
        functionName: 'withdrawProfits',
        args: [amount, accountId],
      })
    } finally {
      setIsPending(false)
    }
  }

  return { withdrawProfits, isPending }
}

export function useBook(questionId) {
  const { address } = useAccount()
  const accountId = useSessionAccountId()
  const pid = housePlayerId(address, accountId)
  const { data, isLoading, refetch } = useReadContract({
    address: HOUSE_BANK_ADDRESS,
    abi: HOUSE_BANK_ABI,
    functionName: 'book',
    args: questionId ? [questionId] : undefined,
    query: { enabled: Boolean(questionId && isHouseConfigured), refetchInterval: 4000 },
  })
  const { data: side } = useReadContract({
    address: HOUSE_BANK_ADDRESS,
    abi: HOUSE_BANK_ABI,
    functionName: 'pickOf',
    args: address && questionId && accountId ? [questionId, address, accountId] : undefined,
    query: { enabled: Boolean(address && questionId && accountId && isHouseConfigured), refetchInterval: 4000 },
  })
  const { data: userStake0 } = useReadContract({
    address: HOUSE_BANK_ADDRESS,
    abi: HOUSE_BANK_ABI,
    functionName: 'userStake',
    args: questionId && pid ? [questionId, pid, 0n] : undefined,
    query: { enabled: Boolean(questionId && pid && isHouseConfigured), refetchInterval: 4000 },
  })
  const { data: userStake1 } = useReadContract({
    address: HOUSE_BANK_ADDRESS,
    abi: HOUSE_BANK_ABI,
    functionName: 'userStake',
    args: questionId && pid ? [questionId, pid, 1n] : undefined,
    query: { enabled: Boolean(questionId && pid && isHouseConfigured), refetchInterval: 4000 },
  })
  const book = useMemo(() => {
    if (!data) {
      return { stake0: 0n, stake1: 0n, odds0: 0n, odds1: 0n, executable: false, settled: false, voided: false }
    }
    const row = Array.isArray(data)
      ? data
      : [data.stake0, data.stake1, data.odds0, data.odds1, data.executable, data.settled, data.voided]
    return {
      stake0: row[0] ?? 0n,
      stake1: row[1] ?? 0n,
      odds0: row[2] ?? 0n,
      odds1: row[3] ?? 0n,
      executable: Boolean(row[4]),
      settled: Boolean(row[5]),
      voided: Boolean(row[6]),
    }
  }, [data])
  return {
    book,
    userSide: Number(side ?? 0),
    userStake0: userStake0 ?? 0n,
    userStake1: userStake1 ?? 0n,
    isLoading,
    refetch,
  }
}

export function useHouseTrade() {
  const { writeContractAsync, data: tradeHash, isPending } = useWriteContract()
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: tradeHash })
  const [localPending, setLocalPending] = useState(false)
  const accountId = useSessionAccountId()

  async function placeBet({ questionId, investmentAmount, outcomeIndex }) {
    if (!isHouseConfigured) throw new Error('La casa no está desplegada.')
    if (!accountId) throw new Error('Necesitas iniciar sesión con Google.')
    const { address } = getAccount(wagmiConfig)
    if (!address) throw new Error('Conecta la wallet.')
    setLocalPending(true)
    try {
      return await houseWrite(
        writeContractAsync,
        {
          address: HOUSE_BANK_ADDRESS,
          abi: HOUSE_BANK_ABI,
          functionName: 'placeBet',
          args: [questionId, investmentAmount, outcomeIndex, accountId],
        },
        { simulate: true },
      )
    } finally {
      setLocalPending(false)
    }
  }

  async function cancelBet(questionId) {
    if (!isHouseConfigured) throw new Error('La casa no está desplegada.')
    if (!accountId) throw new Error('Necesitas iniciar sesión con Google.')
    setLocalPending(true)
    try {
      return await houseWrite(writeContractAsync, {
        address: HOUSE_BANK_ADDRESS,
        abi: HOUSE_BANK_ABI,
        functionName: 'cancelBet',
        args: [questionId, accountId],
      })
    } finally {
      setLocalPending(false)
    }
  }

  async function claim(questionId) {
    if (!isHouseConfigured) throw new Error('La casa no está desplegada.')
    setLocalPending(true)
    try {
      return await houseWrite(writeContractAsync, {
        address: HOUSE_BANK_ADDRESS,
        abi: HOUSE_BANK_ABI,
        functionName: 'claim',
        args: [questionId],
      })
    } finally {
      setLocalPending(false)
    }
  }

  return { placeBet, cancelBet, claim, isPending: isPending || isConfirming || localPending, tradeHash }
}
