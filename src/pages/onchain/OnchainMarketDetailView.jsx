// On-chain market detail — rendered by MarketDetailPage.jsx at
// /mercados/:id only when FEATURE_FLAGS.web3 is on. Here `id` is the
// market's bytes32 `questionId` hex string (not a Postgres UUID like the
// legacy route) — see design.md Decision 3. Buy/sell/redeem run through
// MarketFactory/ResolutionAdapter directly; pricing math stays entirely
// inside the audited FPMM (Decision 1). No wallet required to view; a
// connected wallet is required only to trade (wallet-identity spec
// "No Required GG2 Account for Trading").
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, TrendingUp, AlertCircle } from 'lucide-react'
import { useMarket, useTrade, useWalletConnect } from '../../lib/web3/hooks.js'
import { MARKET_STATE } from '../../lib/web3/contracts.js'
import { translateError } from '../../lib/web3/translateError.js'
import { formatUsdc, parseUsdc } from '../../lib/web3/format.js'

export default function OnchainMarketDetailView() {
  const { id: questionId } = useParams()
  const { market, isLoading, error, refetch } = useMarket(questionId)
  const { address, isConnected, connectors, connect } = useWalletConnect()
  const { buy, isPending } = useTrade()

  const [outcomeIndex, setOutcomeIndex] = useState(0)
  const [investAmount, setInvestAmount] = useState('10')
  const [tradeError, setTradeError] = useState(null)

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-zinc-500">Cargando mercado on-chain…</p>
  }

  if (error || !market || market.state === MARKET_STATE.NONE) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-rose-800/50 bg-rose-950/20 p-6 text-center">
        <AlertCircle size={32} className="mx-auto mb-2 text-rose-400" />
        <p className="text-sm text-rose-300">No encontramos este mercado on-chain.</p>
        <Link to="/" className="mt-4 inline-block text-xs text-violet-400 hover:underline">
          Volver al inicio
        </Link>
      </div>
    )
  }

  const handleBuy = async (e) => {
    e.preventDefault()
    setTradeError(null)
    try {
      await buy({ questionId, investmentAmount: parseUsdc(investAmount), outcomeIndex: BigInt(outcomeIndex) })
      await refetch()
    } catch (err) {
      setTradeError(translateError(err) || 'La transacción falló.')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300">
        <ArrowLeft size={14} /> Volver
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/30 via-zinc-900/60 to-zinc-950 p-6">
          <div className="flex items-center gap-2">
            <TrendingUp className="text-violet-400" size={18} />
            <h1 className="text-lg font-bold text-zinc-50">Mercado on-chain</h1>
          </div>
          <p className="mt-1 font-mono text-xs text-zinc-500">{questionId}</p>
          <p className="mt-3 text-sm text-zinc-400">
            Estado: <span className="font-semibold text-zinc-200">{market.stateLabel}</span>
          </p>
          <p className="font-mono text-xs text-zinc-500">FPMM: {market.fpmm}</p>
        </div>

        {market.state !== MARKET_STATE.ACTIVE ? (
          <p className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-300">
            Este mercado no está ACTIVE todavía — el trading no está disponible en este estado.
          </p>
        ) : !isConnected ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <p className="text-sm text-zinc-400">Conectá una wallet para operar (no requiere cuenta GG2).</p>
            {connectors.map((connector) => (
              <button
                key={connector.uid}
                type="button"
                onClick={() => connect(connector)}
                className="rounded-xl bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
              >
                Conectar con {connector.name}
              </button>
            ))}
          </div>
        ) : (
          <form
            onSubmit={handleBuy}
            className="flex flex-col gap-4 rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-950/30 via-zinc-900/60 to-zinc-950 p-6"
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOutcomeIndex(0)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
                  outcomeIndex === 0 ? 'bg-emerald-600 text-white' : 'border border-zinc-800 text-zinc-300'
                }`}
              >
                Outcome A
              </button>
              <button
                type="button"
                onClick={() => setOutcomeIndex(1)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold ${
                  outcomeIndex === 1 ? 'bg-rose-600 text-white' : 'border border-zinc-800 text-zinc-300'
                }`}
              >
                Outcome B
              </button>
            </div>

            <div>
              <label htmlFor="invest-amount" className="mb-1 block text-xs font-medium text-zinc-400">
                Monto a invertir (USDC)
              </label>
              <input
                id="invest-amount"
                type="number"
                min="0"
                step="0.01"
                value={investAmount}
                onChange={(e) => setInvestAmount(e.target.value)}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 font-mono text-sm text-zinc-100 outline-none focus:border-violet-500"
              />
            </div>

            {tradeError && <p className="text-xs text-rose-400">{tradeError}</p>}

            <button
              type="submit"
              disabled={isPending}
              className="rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {isPending ? 'Confirmando…' : `Comprar shares (${formatUsdc(parseUsdc(investAmount))} USDC)`}
            </button>
            <p className="text-center font-mono text-[11px] text-zinc-600">Wallet conectada: {address}</p>
          </form>
        )}
      </div>
    </div>
  )
}
