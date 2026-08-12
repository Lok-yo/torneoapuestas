import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, ArrowRight, CheckCircle, PlusCircle, Search, Filter } from 'lucide-react'
import { listMarkets, createPredictionMarket, buyMarketShares } from '../repositories/marketRepository.js'
import { useSession } from '../auth/SessionProvider.jsx'
import { toAppError } from '../lib/errors.js'

export default function TournamentPredictionWidget({ tournamentId, isOrganizer }) {
  const { sessionStatus } = useSession()
  const [markets, setMarkets] = useState([])
  const [status, setStatus] = useState('loading')

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  // Quick buy state
  const [buyingMarketId, setBuyingMarketId] = useState(null)
  const [buyingOutcomeId, setBuyingOutcomeId] = useState(null)
  const [buyPending, setBuyPending] = useState(false)
  const [buySuccess, setBuySuccess] = useState(null)

  // Quick create state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [createPending, setCreatePending] = useState(false)

  const loadMarkets = async () => {
    setStatus('loading')
    try {
      const data = await listMarkets(tournamentId)
      setMarkets(data)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    if (tournamentId) {
      loadMarkets()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId])

  const handleQuickBuy = async (marketId, outcomeId, shares = 10) => {
    setBuyingMarketId(marketId)
    setBuyingOutcomeId(outcomeId)
    setBuyPending(true)
    setBuySuccess(null)
    try {
      await buyMarketShares(marketId, outcomeId, shares)
      setBuySuccess('¡Acciones compradas con éxito!')
      await loadMarkets()
    } catch (err) {
      alert(toAppError(err).message)
    } finally {
      setBuyPending(false)
      setBuyingMarketId(null)
      setBuyingOutcomeId(null)
    }
  }

  const handleCreateMarket = async (e) => {
    e.preventDefault()
    if (!newQuestion.trim()) return
    setCreatePending(true)
    try {
      await createPredictionMarket(tournamentId, newQuestion.trim())
      setNewQuestion('')
      setShowCreateModal(false)
      await loadMarkets()
    } catch (err) {
      alert(toAppError(err).message)
    } finally {
      setCreatePending(false)
    }
  }

  // Filter markets client-side
  const filteredMarkets = markets.filter((m) => {
    const matchesSearch = !searchQuery || m.question.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter
    const matchesCategory = categoryFilter === 'ALL' || m.category === categoryFilter
    return matchesSearch && matchesStatus && matchesCategory
  })

  if (status === 'loading') {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-5 text-center text-xs text-zinc-500">
        Cargando mercados de predicción…
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-violet-500/20 bg-gradient-to-b from-violet-950/20 via-zinc-900/50 to-zinc-950 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-violet-400" size={20} />
          <h2 className="text-base font-bold text-zinc-50">Mercados de Predicción (Polymarket)</h2>
        </div>
        {isOrganizer && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 transition"
          >
            <PlusCircle size={14} /> Crear Mercado
          </button>
        )}
      </div>

      {/* Controles de Búsqueda y Filtros */}
      {markets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-zinc-500" />
            <input
              type="text"
              aria-label="Buscar mercados"
              placeholder="Buscar mercados…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300">
            <Filter size={14} className="text-zinc-500" />
            <label htmlFor="widget-status-filter" className="text-[11px] text-zinc-500">Estado:</label>
            <select
              id="widget-status-filter"
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-zinc-100 outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-zinc-900">Todos</option>
              <option value="OPEN" className="bg-zinc-900">Abiertos</option>
              <option value="RESOLVED" className="bg-zinc-900">Resueltos</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300">
            <label htmlFor="widget-category-filter" className="text-[11px] text-zinc-500">Categoría:</label>
            <select
              id="widget-category-filter"
              aria-label="Filtrar por categoría"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-xs text-zinc-100 outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-zinc-900">Todas</option>
              <option value="TOURNAMENT" className="bg-zinc-900">Torneo</option>
              <option value="MATCH" className="bg-zinc-900">Partido</option>
              <option value="PLAYER" className="bg-zinc-900">Jugador</option>
              <option value="SPECIAL" className="bg-zinc-900">Especial</option>
            </select>
          </div>
        </div>
      )}

      {buySuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-400">
          <CheckCircle size={16} /> {buySuccess}
        </div>
      )}

      {filteredMarkets.length === 0 ? (
        <div className="py-6 text-center text-xs text-zinc-400">
          {markets.length === 0
            ? 'Aún no hay mercados de predicción activos para este torneo.'
            : 'No se encontraron mercados de predicción con los filtros aplicados.'}
          {isOrganizer && markets.length === 0 && (
            <p className="mt-1 text-zinc-500">
              Como organizador, podés crear uno para que los espectadores apuesten por sus favoritos.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredMarkets.map((m) => {
            const outcomes = m.market_outcomes || []
            return (
              <div
                key={m.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/80 p-5 transition hover:border-zinc-700"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>{m.category}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status === 'OPEN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {m.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-zinc-100">{m.question}</h3>
                </div>

                {/* Probabilidades de las Opciones */}
                <div className="grid grid-cols-2 gap-2">
                  {outcomes.map((o) => {
                    const prob = Math.round(Number(o.price) * 100)
                    const isBuying = buyingMarketId === m.id && buyingOutcomeId === o.id
                    return (
                      <div
                        key={o.id}
                        className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                          <span>{o.label}</span>
                          <span className="text-violet-400">{prob}%</span>
                        </div>

                        {sessionStatus === 'authenticated' && m.status === 'OPEN' && (
                          <button
                            type="button"
                            disabled={buyPending}
                            onClick={() => handleQuickBuy(m.id, o.id, 10)}
                            className="mt-3 w-full rounded-lg bg-violet-600/80 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                          >
                            {isBuying ? 'Comprando…' : `Comprar 10 en $${(10 * Number(o.price)).toFixed(2)}`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="pt-2 border-t border-zinc-900 flex justify-end">
                  <Link
                    to={`/mercados/${m.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-violet-400 hover:text-violet-300"
                  >
                    Ver detalles y operar <ArrowRight size={12} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal rápido de creación de Mercado para Organizadores */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="create-market-modal-title">
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <h3 id="create-market-modal-title" className="text-lg font-bold text-zinc-50 mb-2">Crear Mercado de Predicción</h3>
            <p className="text-xs text-zinc-400 mb-4">
              Definí una pregunta binaria (SÍ / NO) sobre este torneo para que la comunidad opere acciones.
            </p>

            <form onSubmit={handleCreateMarket} className="flex flex-col gap-4">
              <div>
                <label htmlFor="widget-question-input" className="block text-xs font-medium text-zinc-400 mb-1">Pregunta del Mercado</label>
                <input
                  id="widget-question-input"
                  type="text"
                  required
                  placeholder="Ej: ¿Gana @jugador1 el torneo?"
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createPending}
                  className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {createPending ? 'Creando…' : 'Crear Mercado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
