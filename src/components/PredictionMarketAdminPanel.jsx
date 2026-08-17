// Prediction-market admin panel (create_prediction_market / resolve_market),
// split out of OrganizerPanelPage so it renders independently of the
// internal tournament-creation authority flow — tournaments will be sourced
// from the external start.gg API instead of created here. See
// openspec/changes/p2p-crypto-prediction-markets/ for the prediction-markets
// direction this panel belongs to.
//
// Still reads tournamentRepository.listTournaments() (read-only) so an
// organizer can attach a new market to one of their existing tournaments —
// that read is unaffected by the tournament-creation retirement.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, PlusCircle, CheckCircle, ExternalLink } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { listTournaments } from '../repositories/tournamentRepository.js'
import { listMarkets, createPredictionMarket, resolveMarket } from '../repositories/marketRepository.js'
import { toAppError } from '../lib/errors.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import OnchainMarketAdminView from '../pages/onchain/OnchainMarketAdminView.jsx'

export default function PredictionMarketAdminPanel() {
  // Repointed to a read-only view over on-chain markets when
  // FEATURE_FLAGS.web3 is on — permissionless creation removes the
  // admin-approval gate this legacy panel implements. See tasks.md 12.2.
  if (FEATURE_FLAGS.web3) {
    return <OnchainMarketAdminView />
  }

  return <LegacyPredictionMarketAdminPanel />
}

function LegacyPredictionMarketAdminPanel() {
  const { session } = useSession()
  const [tournaments, setTournaments] = useState([])
  const [markets, setMarkets] = useState([])
  const [error, setError] = useState(null)
  const [actionError, setActionError] = useState(null)

  const [selectedTournamentId, setSelectedTournamentId] = useState('')
  const [marketQuestion, setMarketQuestion] = useState('')
  const [marketCategory, setMarketCategory] = useState('TOURNAMENT')
  const [creatingMarket, setCreatingMarket] = useState(false)
  const [marketSuccess, setMarketSuccess] = useState(null)
  const [resolvingMarketId, setResolvingMarketId] = useState(null)

  const reload = async () => {
    try {
      const allTournaments = await listTournaments()
      const ownTournaments = session?.user?.id
        ? allTournaments.filter((t) => t.organizer_id === session?.user?.id)
        : allTournaments
      setTournaments(ownTournaments)
      setSelectedTournamentId((prev) => prev || ownTournaments[0]?.id || '')
      const allMarkets = await listMarkets().catch(() => [])
      setMarkets(allMarkets)
    } catch (rawError) {
      setError(toAppError(rawError))
    }
  }

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  const handleCreateMarket = async (e) => {
    e.preventDefault()
    const question = marketQuestion.trim()
    if (!question || !selectedTournamentId) return

    setCreatingMarket(true)
    setActionError(null)
    setMarketSuccess(null)
    try {
      await createPredictionMarket(selectedTournamentId, question, marketCategory)
      setMarketQuestion('')
      setMarketSuccess('¡Mercado de predicción creado con éxito!')
      await reload()
    } catch (err) {
      setActionError(toAppError(err).message)
    } finally {
      setCreatingMarket(false)
    }
  }

  const handleResolveMarket = async (marketId, outcomeId) => {
    if (!confirm('¿Confirmás la resolución de este mercado? Las ganancias se acreditarán automáticamente en las billeteras de los ganadores.')) return

    setResolvingMarketId(marketId)
    setActionError(null)
    try {
      await resolveMarket(marketId, outcomeId)
      await reload()
    } catch (err) {
      setActionError(toAppError(err).message)
    } finally {
      setResolvingMarketId(null)
    }
  }

  if (error) {
    return (
      <p role="alert" className="text-sm text-rose-400">
        No pudimos cargar los mercados de predicción ahora mismo.
      </p>
    )
  }

  return (
    <section className="mt-4 flex flex-col gap-4 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/30 via-zinc-900/60 to-zinc-950 p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="text-violet-400" size={18} />
        <h2 className="text-sm font-bold text-zinc-50">Mercados de Predicción (Polymarket)</h2>
      </div>

      {actionError && (
        <p role="alert" className="text-xs text-rose-400">
          No se pudo completar la acción ({actionError}).
        </p>
      )}

      {marketSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400">
          <CheckCircle size={14} /> {marketSuccess}
        </div>
      )}

      {tournaments.length > 0 && (
        <form onSubmit={handleCreateMarket} className="flex flex-col gap-3 border-b border-zinc-800 pb-4">
          <h3 className="text-xs font-semibold text-zinc-300">Publicar nuevo mercado</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="market-tournament" className="block text-[11px] font-medium text-zinc-400 mb-1">Torneo Asociado</label>
              <select
                id="market-tournament"
                value={selectedTournamentId}
                onChange={(e) => setSelectedTournamentId(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-violet-500"
              >
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="market-category" className="block text-[11px] font-medium text-zinc-400 mb-1">Categoría</label>
              <select
                id="market-category"
                value={marketCategory}
                onChange={(e) => setMarketCategory(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-violet-500"
              >
                <option value="TOURNAMENT">Torneo (Ganador Final)</option>
                <option value="MATCH">Partido Específico</option>
                <option value="PLAYER">Desempeño de Jugador</option>
                <option value="SPECIAL">Especial / Bracket Reset</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="market-question" className="block text-[11px] font-medium text-zinc-400 mb-1">Pregunta del Mercado</label>
            <input
              id="market-question"
              type="text"
              required
              placeholder="Ej: ¿Habrá reset de bracket en las Grand Finals?"
              value={marketQuestion}
              onChange={(e) => setMarketQuestion(e.target.value)}
              disabled={creatingMarket}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-xs text-zinc-100 placeholder-zinc-500 outline-none focus:border-violet-500"
            />
          </div>

          <button
            type="submit"
            disabled={creatingMarket || !marketQuestion.trim()}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          >
            <PlusCircle size={14} />
            {creatingMarket ? 'Creando Mercado…' : 'Publicar Mercado'}
          </button>
        </form>
      )}

      {/* Mercados Activos */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-zinc-300">Mercados de Predicción Creados</h3>
        {markets.length === 0 ? (
          <p className="text-xs text-zinc-400">Aún no hay mercados de predicción creados.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {markets.map((m) => (
              <div key={m.id} className="flex flex-col justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4">
                <div>
                  <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                    <span>{m.category}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${m.status === 'OPEN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                      {m.status}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-zinc-100">{m.question}</h4>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-zinc-900 text-xs">
                  <Link to={`/mercados/${m.id}`} className="inline-flex items-center gap-1 text-violet-400 hover:underline">
                    Ver mercado <ExternalLink size={12} />
                  </Link>

                  {m.status === 'OPEN' && (
                    <div className="flex gap-1">
                      {m.market_outcomes?.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          disabled={resolvingMarketId === m.id}
                          onClick={() => handleResolveMarket(m.id, o.id)}
                          className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-300 hover:bg-amber-500/20"
                        >
                          Gana {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
