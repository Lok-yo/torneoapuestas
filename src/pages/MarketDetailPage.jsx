import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, TrendingUp, CheckCircle, AlertCircle, DollarSign, Award } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { getMarketDetails, buyMarketShares, resolveMarket } from '../repositories/marketRepository.js'
import { getWallet } from '../repositories/walletRepository.js'
import { toAppError } from '../lib/errors.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import OnchainMarketDetailView from './onchain/OnchainMarketDetailView.jsx'

export default function MarketDetailPage() {
  // Repointed on-chain when FEATURE_FLAGS.web3 is on (default off). The
  // route param becomes a bytes32 questionId instead of a Postgres UUID
  // — see OnchainMarketDetailView.jsx and design.md Decision 3/7.
  if (FEATURE_FLAGS.web3) {
    return <OnchainMarketDetailView />
  }

  return <LegacyMarketDetailPage />
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

  return (
    <div className="flex flex-col gap-8">
      <Link to="/torneos" className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition">
        <ArrowLeft size={14} /> Volver a torneos
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* Detalle y Probabilidades del Mercado */}
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <span className="rounded-full border border-violet-500/40 bg-violet-500/10 px-3.5 py-1 text-xs font-semibold text-violet-300">
              Categoría: {market.category}
            </span>
            <span
              className={`rounded-full px-3.5 py-1 text-xs font-bold ${
                market.status === 'OPEN'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {market.status === 'OPEN' ? 'ABIERTO' : market.status}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-zinc-50 leading-snug sm:text-3xl">{market.question}</h1>

          {/* Opciones de Resultado y Probabilidad */}
          <div className="flex flex-col gap-4 rounded-3xl border border-zinc-800/80 bg-zinc-950/60 p-6 shadow-xl backdrop-blur">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Probabilidades y Volumen de Opciones
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {outcomes.map((o) => {
                const prob = Math.round(Number(o.price) * 100)
                const isWinner = market.resolution_outcome_id === o.id
                const isSelected = selectedOutcomeId === o.id
                return (
                  <div
                    key={o.id}
                    className={`rounded-2xl border p-5 transition ${
                      isSelected
                        ? 'border-violet-500 bg-gradient-to-b from-violet-950/40 to-zinc-950 shadow-lg shadow-violet-500/10'
                        : 'border-zinc-800/80 bg-zinc-900/50'
                    }`}
                  >
                    {/* Superficie de selección: un <button> real sin hijos
                        interactivos (el control de resolución es hermano,
                        no descendiente — sin interactivo anidado). */}
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
                        <span className="font-bold text-zinc-100 text-sm">{o.label}</span>
                        {isWinner && <CheckCircle size={18} className="text-emerald-400" />}
                      </span>
                      <span className="mt-4 flex items-end justify-between">
                        <span>
                          <span className="text-3xl font-extrabold text-zinc-50">{prob}%</span>
                          <span className="ml-2 text-xs text-zinc-400 font-medium">
                            (${(Number(o.price)).toFixed(2)} / acción)
                          </span>
                        </span>
                        <span className="text-xs text-zinc-500">{Number(o.total_shares)} acciones</span>
                      </span>

                      {/* Barra de progreso visual */}
                      <span className="mt-3 block h-2 w-full overflow-hidden rounded-full bg-zinc-900">
                        <span className="block h-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${prob}%` }} />
                      </span>
                    </button>

                    {/* Botón de Resolución para Organizadores */}
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

          {/* Posiciones del Usuario */}
          {userPositions.length > 0 && (
            <div className="rounded-3xl border border-zinc-800/80 bg-zinc-950/60 p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4 text-xs font-bold uppercase tracking-wider text-zinc-400">
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
                          Precio promedio: ${(Number(pos.avg_price)).toFixed(2)} USD
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

        {/* Panel de Compra de Acciones (Polymarket Trading Widget) */}
        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-violet-500/30 bg-gradient-to-b from-violet-950/40 via-zinc-950 to-zinc-950 p-6 shadow-2xl backdrop-blur">
            <h2 className="text-lg font-bold text-zinc-50 mb-1 flex items-center gap-2">
              <TrendingUp size={20} className="text-violet-400" /> Operar Mercado
            </h2>
            <p className="text-xs text-zinc-400 mb-6">
              Compra acciones al precio actual de probabilidad. Si tu opción gana, cobras <strong className="text-emerald-400">$1.00 USD</strong> por acción.
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
                  <label className="block text-xs font-semibold text-zinc-400 mb-2">Opción Seleccionada</label>
                  <div className="grid grid-cols-2 gap-2">
                    {outcomes.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setSelectedOutcomeId(o.id)}
                        className={`rounded-xl border py-2.5 px-3 text-xs font-bold transition ${
                          selectedOutcomeId === o.id
                            ? 'border-violet-500 bg-violet-500/20 text-violet-200 shadow-md'
                            : 'border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {o.label} ({(Number(o.price) * 100).toFixed(0)}%)
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="shares-amount-input" className="block text-xs font-semibold text-zinc-400">Cantidad de Acciones</label>
                    <div className="flex gap-1">
                      {[5, 10, 25, 50, 100].map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setSharesAmount(String(val))}
                          className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-zinc-400 hover:border-violet-500/50 hover:text-violet-300"
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
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-100 outline-none focus:border-violet-500"
                  />
                </div>

                <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 text-xs flex flex-col gap-2">
                  <div className="flex justify-between text-zinc-400">
                    <span>Precio unitario:</span>
                    <span className="font-semibold text-zinc-200">${(Number(selectedOutcome?.price || 0.5)).toFixed(2)} USD</span>
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
                    <div className="flex justify-between text-zinc-500 pt-2 border-t border-zinc-800/80">
                      <span>Saldo disponible:</span>
                      <span className="font-medium text-emerald-300 inline-flex items-center gap-0.5">
                        <DollarSign size={12} /> {wallet.available_balance.toFixed(2)} USD
                      </span>
                    </div>
                  )}
                </div>

                {actionError && <p className="text-xs font-medium text-rose-400">{actionError}</p>}

                <button
                  type="submit"
                  disabled={pending}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 py-3 text-xs font-bold text-white shadow-lg shadow-violet-500/25 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 transition"
                >
                  {pending ? 'Comprando acciones…' : 'Comprar Acciones'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
