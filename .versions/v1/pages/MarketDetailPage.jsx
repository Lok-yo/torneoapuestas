import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, TrendingUp, CheckCircle, AlertCircle, DollarSign, Award } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { getMarketDetails, buyMarketShares, resolveMarket } from '../repositories/marketRepository.js'
import { getWallet } from '../repositories/walletRepository.js'
import { toAppError } from '../lib/errors.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import OnchainMarketDetailView from './onchain/OnchainMarketDetailView.jsx'
import MarketPriceChart from '../components/MarketPriceChart.jsx'

export default function MarketDetailPage() {
  // Repointed on-chain when FEATURE_FLAGS.web3 is on (default off). The
  // route param becomes a bytes32 questionId instead of a Postgres UUID
  // — see OnchainMarketDetailView.jsx and design.md Decision 3/7.
  if (FEATURE_FLAGS.web3) {
    return <OnchainMarketDetailView />
  }

  return <LegacyMarketDetailPage />
}

function outcomeTone(label) {
  const t = String(label || '').toLowerCase()
  if (/^(sí|si|yes)$/.test(t)) return 'yes'
  if (/^(no)$/.test(t)) return 'no'
  return 'neutral'
}

function SimulatedOrderBook({ outcomes }) {
  const totalShares = outcomes.reduce((sum, o) => sum + Number(o.total_shares || 0), 0)

  return (
    <div className="border border-[#243028] bg-[#0c1410] p-5 shadow-xl backdrop-blur-md">
      <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">Libro de profundidad</h3>
      <div className="space-y-2">
        {outcomes.map((o) => {
          const shares = Number(o.total_shares || 0)
          const pct = totalShares > 0 ? (shares / totalShares) * 100 : 0
          const tone = outcomeTone(o.label)
          return (
            <div key={o.id} className="relative overflow-hidden rounded-xl border border-white/5 bg-black/30 px-3 py-2">
              <div
                className={`absolute inset-y-0 left-0 opacity-20 ${
                  tone === 'yes' ? 'bg-emerald-400' : tone === 'no' ? 'bg-rose-400' : 'bg-violet-400'
                }`}
                style={{ width: `${Math.max(pct, 4)}%` }}
              />
              <div className="relative flex items-center justify-between font-mono text-[11px]">
                <span
                  className={
                    tone === 'yes' ? 'text-emerald-300' : tone === 'no' ? 'text-rose-300' : 'text-violet-300'
                  }
                >
                  {o.label}
                </span>
                <span className="text-zinc-400">
                  {shares} sh · ${Number(o.price).toFixed(2)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 font-mono text-[10px] text-zinc-600">
        Profundidad derivada de acciones emitidas · {totalShares} sh
      </p>
    </div>
  )
}

function LegacyMarketDetailPage() {
  const { id } = useParams()
  const { profile, hasRole } = useSession()
  const isOrganizerOrAdmin = hasRole('organizer') || hasRole('admin')

  const [state, setState] = useState({ status: 'loading', market: null, outcomes: [], userPositions: [], wallet: null, error: null })
  const [selectedOutcomeId, setSelectedOutcomeId] = useState(null)
  const [sharesAmount, setSharesAmount] = useState('10')
  const [pending, setPending] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [resolvePending, setResolvePending] = useState(false)

  const loadData = async () => {
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const details = await getMarketDetails(id)
      let wallet = null
      if (profile?.username) {
        wallet = await getWallet().catch(() => null)
      }
      setState({
        status: 'ready',
        market: details.market,
        outcomes: details.outcomes,
        userPositions: details.userPositions,
        wallet,
        error: null,
      })
      if (details.outcomes.length > 0 && !selectedOutcomeId) {
        setSelectedOutcomeId(details.outcomes[0].id)
      }
    } catch (err) {
      setState({ status: 'error', market: null, outcomes: [], userPositions: [], wallet: null, error: toAppError(err) })
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const handleBuyShares = async (e) => {
    e.preventDefault()
    if (!selectedOutcomeId) return
    const sharesNum = parseFloat(sharesAmount)
    if (isNaN(sharesNum) || sharesNum <= 0) {
      setActionError('Ingresá una cantidad válida de acciones.')
      return
    }

    setPending(true)
    setActionError(null)
    try {
      await buyMarketShares(id, selectedOutcomeId, sharesNum)
      await loadData()
    } catch (err) {
      setActionError(toAppError(err).message)
    } finally {
      setPending(false)
    }
  }

  const handleResolveMarket = async (winningOutcomeId) => {
    if (!confirm('¿Estás seguro de resolver este mercado con esta opción ganadora? Esta acción acreditará las ganancias automáticamente.')) return

    setResolvePending(true)
    setActionError(null)
    try {
      await resolveMarket(id, winningOutcomeId)
      await loadData()
    } catch (err) {
      setActionError(toAppError(err).message)
    } finally {
      setResolvePending(false)
    }
  }

  if (state.status === 'loading') {
    return <p className="py-12 text-center text-sm text-zinc-500">Cargando mercado de predicción…</p>
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-md rounded-3xl border border-rose-800/50 bg-rose-950/20 p-6 text-center shadow-xl">
        <AlertCircle size={32} className="mx-auto mb-2 text-rose-400" />
        <p className="text-sm font-semibold text-rose-300">No pudimos cargar este mercado.</p>
        <p className="mt-1 text-xs text-zinc-400">{state.error?.message}</p>
        <Link to="/torneos" className="mt-4 inline-block text-xs font-medium text-violet-400 hover:underline">
          Volver a torneos
        </Link>
      </div>
    )
  }

  const { market, outcomes, userPositions, wallet } = state
  const selectedOutcome = outcomes.find((o) => o.id === selectedOutcomeId) || outcomes[0]
  const estimatedCost = selectedOutcome ? (parseFloat(sharesAmount) || 0) * Number(selectedOutcome.price) : 0
  const yesOutcome = outcomes.find((o) => outcomeTone(o.label) === 'yes') || outcomes[0]
  const yesPrice = Number(yesOutcome?.price ?? 0.5)
  const snapshotHistory = [
    { t: 'prev', price: yesPrice },
    { t: 'now', price: yesPrice },
  ]

  return (
    <div className="flex flex-col gap-8">
      <Link to="/torneos" className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition">
        <ArrowLeft size={14} /> Volver a torneos
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
              Categoría: {market.category}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-bold ${
                market.status === 'OPEN'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {market.status === 'OPEN' && <span className="live-dot" />}
              {market.status === 'OPEN' ? 'ABIERTO' : market.status}
            </span>
          </div>

          <h1 className="text-2xl font-bold leading-snug text-zinc-50 sm:text-3xl">{market.question}</h1>

          <div className="border border-[#243028] bg-[#0c1410] p-6 shadow-xl backdrop-blur">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Tendencia de precio</h2>
              <span className="font-mono text-[11px] text-emerald-400">{Math.round(yesPrice * 100)}% SÍ</span>
            </div>
            <MarketPriceChart priceHistory={snapshotHistory} />
          </div>

          <div className="flex flex-col gap-4 border border-[#243028] bg-[#0c1410] p-6 shadow-xl backdrop-blur">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Probabilidades y Volumen de Opciones
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {outcomes.map((o) => {
                const prob = Math.round(Number(o.price) * 100)
                const isWinner = market.resolution_outcome_id === o.id
                const isSelected = selectedOutcomeId === o.id
                const tone = outcomeTone(o.label)
                return (
                  <div
                    key={o.id}
                    className={`rounded-2xl border p-5 transition ${
                      isSelected
                        ? 'border-violet-500 bg-gradient-to-b from-violet-950/40 to-zinc-950 shadow-lg shadow-violet-500/10'
                        : 'border-zinc-800/80 bg-zinc-900/50'
                    }`}
                  >
                    <button
                      type="button"
                      disabled={market.status !== 'OPEN'}
                      aria-pressed={market.status === 'OPEN' ? isSelected : undefined}
                      onClick={() => setSelectedOutcomeId(o.id)}
                      className={`flex w-full flex-col text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                        market.status === 'OPEN' ? 'cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <span className="flex items-center justify-between">
                        <span className="text-sm font-bold text-zinc-100">{o.label}</span>
                        {isWinner && <CheckCircle size={18} className="text-emerald-400" />}
                      </span>
                      <span className="mt-4 flex items-end justify-between">
                        <span>
                          <span className="text-3xl font-extrabold text-zinc-50">{prob}%</span>
                          <span className="ml-2 text-xs font-medium text-zinc-400">
                            (${Number(o.price).toFixed(2)} / acción)
                          </span>
                        </span>
                        <span className="font-mono text-xs text-zinc-500">{Number(o.total_shares)} acciones</span>
                      </span>

                      <span className="mt-3 block h-2 w-full overflow-hidden rounded-full bg-zinc-900">
                        <span
                          className={`block h-full ${
                            tone === 'yes'
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : tone === 'no'
                                ? 'bg-gradient-to-r from-rose-500 to-pink-400'
                                : 'bg-gradient-to-r from-violet-500 to-indigo-500'
                          }`}
                          style={{ width: `${prob}%` }}
                        />
                      </span>
                    </button>

                    {isOrganizerOrAdmin && market.status === 'OPEN' && (
                      <button
                        type="button"
                        disabled={resolvePending}
                        onClick={() => handleResolveMarket(o.id)}
                        className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-amber-500/20 transition"
                      >
                        Resolver como Ganador
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {userPositions.length > 0 && (
            <div className="border border-[#243028] bg-[#0c1410] p-6 shadow-xl">
              <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <Award size={16} className="text-violet-400" />
                Tus Posiciones en este Mercado
              </div>
              <div className="divide-y divide-zinc-900">
                {userPositions.map((pos) => {
                  const outcome = outcomes.find((o) => o.id === pos.outcome_id)
                  return (
                    <div key={pos.id} className="flex items-center justify-between py-3">
                      <div>
                        <span className="font-semibold text-zinc-100">{outcome?.label || 'Opción'}</span>
                        <p className="text-xs text-zinc-500">
                          Precio promedio: ${Number(pos.avg_price).toFixed(2)} USD
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-zinc-100">{Number(pos.shares)} acciones</span>
                        <p className="text-xs font-semibold text-emerald-400">
                          Retorno a la resolución: ${(Number(pos.shares) * 1.0).toFixed(2)} USD
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="border border-[#243028] bg-[#0c1410] p-5">
            <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold uppercase text-[#f0e6c8]">
              <TrendingUp size={18} className="text-[#c9a227]" /> Operar Mercado
            </h2>
            <p className="mb-6 text-xs text-zinc-400">
              Compra acciones al precio actual de probabilidad. Si tu opción gana, cobras{' '}
              <strong className="text-emerald-400">$1.00 USD</strong> por acción.
            </p>

            {market.status !== 'OPEN' ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <p className="text-sm font-semibold text-zinc-400">Este mercado está resuelto.</p>
                <span className="mt-1 text-xs text-zinc-500">Las ganancias ya fueron acreditadas.</span>
              </div>
            ) : !profile?.username ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-center">
                <p className="text-sm font-medium text-zinc-300">Inicia sesión para operar en este mercado.</p>
                <Link
                  to="/login"
                  className="mt-3 inline-block rounded-xl bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-900 hover:bg-white transition"
                >
                  Ingresar
                </Link>
              </div>
            ) : (
              <form onSubmit={handleBuyShares} className="flex flex-col gap-4">
                <div>
                  <label className="mb-2 block text-xs font-semibold text-zinc-400">Opción Seleccionada</label>
                  <div className="grid grid-cols-2 gap-2">
                    {outcomes.map((o) => {
                      const tone = outcomeTone(o.label)
                      const selected = selectedOutcomeId === o.id
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setSelectedOutcomeId(o.id)}
                          className={`rounded-xl border py-2.5 px-3 text-xs font-bold transition ${
                            selected
                              ? tone === 'yes'
                                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200 shadow-md'
                                : tone === 'no'
                                  ? 'border-rose-400 bg-rose-500/20 text-rose-200 shadow-md'
                                  : 'border-violet-500 bg-violet-500/20 text-violet-200 shadow-md'
                              : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {o.label} ({(Number(o.price) * 100).toFixed(0)}%)
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="shares-amount-input" className="block text-xs font-semibold text-zinc-400">
                      Cantidad de Acciones
                    </label>
                    <div className="flex gap-1">
                      {[5, 10, 25, 50, 100].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSharesAmount(String(val))}
                          className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-400 hover:border-violet-500/50 hover:text-violet-300"
                        >
                          +{val}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    id="shares-amount-input"
                    type="number"
                    min="1"
                    step="1"
                    value={sharesAmount}
                    onChange={(e) => setSharesAmount(e.target.value)}
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 font-mono text-sm font-semibold text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>

                <div className="flex flex-col gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 font-mono text-xs">
                  <div className="flex justify-between text-zinc-400">
                    <span>Precio unitario:</span>
                    <span className="font-semibold text-zinc-200">${Number(selectedOutcome?.price || 0.5).toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Costo total estimado:</span>
                    <span className="font-bold text-violet-300">${estimatedCost.toFixed(2)} USD</span>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <span>Retorno a la resolución:</span>
                    <span className="font-bold text-emerald-400">${(parseFloat(sharesAmount) || 0).toFixed(2)} USD</span>
                  </div>
                  {wallet && (
                    <div className="flex justify-between border-t border-zinc-800/80 pt-2 text-zinc-500">
                      <span>Saldo disponible:</span>
                      <span className="inline-flex items-center gap-0.5 font-medium text-emerald-300">
                        <DollarSign size={12} /> {wallet.available_balance.toFixed(2)} USD
                      </span>
                    </div>
                  )}
                </div>

                {actionError && <p className="text-xs font-medium text-rose-400">{actionError}</p>}

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full bg-[#c9a227] py-3 text-xs font-bold uppercase text-[#141208] hover:bg-[#ddb83a] disabled:opacity-50 transition"
                >
                  {pending ? 'Comprando acciones…' : 'Comprar Acciones'}
                </button>
              </form>
            )}
          </div>

          <SimulatedOrderBook outcomes={outcomes} />
        </div>
      </div>
    </div>
  )
}
