import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, ArrowRight, CheckCircle, PlusCircle, Search, Filter } from 'lucide-react'
import { listMarkets, createPredictionMarket, buyMarketShares } from '../repositories/marketRepository.js'
import { useSession } from '../auth/SessionProvider.jsx'
import { toAppError } from '../lib/errors.js'

function outcomeTone(label) {
  const t = String(label || '').toLowerCase()
  if (/^(sí|si|yes)$/.test(t)) return 'yes'
  if (/^(no)$/.test(t)) return 'no'
  return 'neutral'
}

export default function TournamentPredictionWidget({ tournamentId, isOrganizer }) {
  const { sessionStatus } = useSession()
  const [markets, setMarkets] = useState([])
  const [status, setStatus] = useState('loading')

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')

  const [buyingMarketId, setBuyingMarketId] = useState(null)
  const [buyingOutcomeId, setBuyingOutcomeId] = useState(null)
  const [buyPending, setBuyPending] = useState(false)
  const [buySuccess, setBuySuccess] = useState(null)

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

  const filteredMarkets = markets.filter((m) => {
    const matchesSearch = !searchQuery || m.question.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'ALL' || m.status === statusFilter
    const matchesCategory = categoryFilter === 'ALL' || m.category === categoryFilter
    return matchesSearch && matchesStatus && matchesCategory
  })

  if (status === 'loading') {
    return (
      <div className="border border-[#243028] bg-[#0c1410] p-5 text-center text-xs text-[#6d7566]">Cargando mercados de predicción…</div>
    )
  }

  return (
    <div className="flex flex-col gap-3 border border-[#243028] bg-[#0c1410] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-[#c9a227]" size={18} />
          <h2 className="font-display text-[15px] font-bold uppercase tracking-wide text-[#f0e6c8]">Mercados de Predicción (Polymarket)</h2>
        </div>
        {isOrganizer && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 border border-[#3a4a30] px-3 py-1.5 text-xs font-semibold text-[#c9a227] hover:bg-[#162016] transition"
          >
            <PlusCircle size={14} /> Crear Mercado
          </button>
        )}
      </div>

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
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950/80 pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500"
            />
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs text-zinc-300">
            <Filter size={14} className="text-zinc-500" />
            <label htmlFor="widget-status-filter" className="text-[11px] text-zinc-500">
              Estado:
            </label>
            <select
              id="widget-status-filter"
              aria-label="Filtrar por estado"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-xs text-zinc-100 outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-zinc-900">
                Todos
              </option>
              <option value="OPEN" className="bg-zinc-900">
                Abiertos
              </option>
              <option value="RESOLVED" className="bg-zinc-900">
                Resueltos
              </option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs text-zinc-300">
            <label htmlFor="widget-category-filter" className="text-[11px] text-zinc-500">
              Categoría:
            </label>
            <select
              id="widget-category-filter"
              aria-label="Filtrar por categoría"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-transparent text-xs text-zinc-100 outline-none cursor-pointer"
            >
              <option value="ALL" className="bg-zinc-900">
                Todas
              </option>
              <option value="TOURNAMENT" className="bg-zinc-900">
                Torneo
              </option>
              <option value="MATCH" className="bg-zinc-900">
                Partido
              </option>
              <option value="PLAYER" className="bg-zinc-900">
                Jugador
              </option>
              <option value="SPECIAL" className="bg-zinc-900">
                Especial
              </option>
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
        <div className="grid gap-4">
          {filteredMarkets.map((m) => {
            const outcomes = m.market_outcomes || []
            return (
              <div
                key={m.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/70 p-5 backdrop-blur-md transition hover:border-violet-500/30"
              >
                <div>
                  <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                    <span className="font-mono uppercase tracking-wider">{m.category}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        m.status === 'OPEN'
                          ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {m.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-zinc-100">{m.question}</h3>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {outcomes.map((o) => {
                    const prob = Math.round(Number(o.price) * 100)
                    const isBuying = buyingMarketId === m.id && buyingOutcomeId === o.id
                    const tone = outcomeTone(o.label)
                    const bar =
                      tone === 'yes' ? 'from-emerald-500 to-teal-400' : tone === 'no' ? 'from-rose-500 to-pink-400' : 'from-violet-500 to-indigo-400'
                    return (
                      <div
                        key={o.id}
                        className="flex flex-col justify-between rounded-xl border border-zinc-800/80 bg-zinc-900/60 p-3"
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                          <span>{o.label}</span>
                          <span
                            className={`font-mono ${
                              tone === 'yes' ? 'text-emerald-400' : tone === 'no' ? 'text-rose-400' : 'text-violet-400'
                            }`}
                          >
                            {prob}%
                          </span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-950">
                          <div className={`h-full bg-gradient-to-r ${bar}`} style={{ width: `${prob}%` }} />
                        </div>

                        {sessionStatus === 'authenticated' && m.status === 'OPEN' && (
                          <button
                            type="button"
                            disabled={buyPending}
                            onClick={() => handleQuickBuy(m.id, o.id, 10)}
                            className={`mt-3 w-full rounded-lg py-1.5 text-[11px] font-semibold text-white disabled:opacity-50 ${
                              tone === 'yes'
                                ? 'bg-emerald-600/85 hover:bg-emerald-500'
                                : tone === 'no'
                                  ? 'bg-rose-600/85 hover:bg-rose-500'
                                  : 'bg-violet-600/80 hover:bg-violet-500'
                            }`}
                          >
                            {isBuying ? 'Comprando…' : `Comprar 10 · $${(10 * Number(o.price)).toFixed(2)}`}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div className="flex justify-end border-t border-zinc-900 pt-2">
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

      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-market-modal-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-violet-500/20 bg-zinc-950 p-6 shadow-2xl">
            <h3 id="create-market-modal-title" className="mb-2 text-lg font-bold text-zinc-50">
              Crear Mercado de Predicción
            </h3>
            <p className="mb-4 text-xs text-zinc-400">
              Definí una pregunta binaria (SÍ / NO) sobre este torneo para que la comunidad opere acciones.
            </p>

            <form onSubmit={handleCreateMarket} className="flex flex-col gap-4">
              <div>
                <label htmlFor="widget-question-input" className="mb-1 block text-xs font-medium text-zinc-400">
                  Pregunta del Mercado
                </label>
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
