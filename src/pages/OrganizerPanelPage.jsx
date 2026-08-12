import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, PlusCircle, CheckCircle, ExternalLink } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { listTournaments, advanceTournamentState, createTournament } from '../repositories/tournamentRepository.js'
import { listMarkets, createPredictionMarket, resolveMarket } from '../repositories/marketRepository.js'
import { toAppError } from '../lib/errors.js'

export default function OrganizerPanelPage() {
  const { session } = useSession()
  const [tournaments, setTournaments] = useState(null)
  const [markets, setMarkets] = useState([])
  const [error, setError] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  const [newTournamentName, setNewTournamentName] = useState('')
  const [creating, setCreating] = useState(false)

  // Market creation form state
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
      const allMarkets = await listMarkets().catch(() => [])
      setMarkets(allMarkets)
      if (ownTournaments.length > 0 && !selectedTournamentId) {
        setSelectedTournamentId(ownTournaments[0].id)
      }
    } catch (rawError) {
      setError(toAppError(rawError))
    }
  }

  useEffect(() => {
    let cancelled = false
    listTournaments()
      .then((all) => {
        if (cancelled) return
        const own = session?.user?.id ? all.filter((t) => t.organizer_id === session?.user?.id) : all
        setTournaments(own)
        listMarkets()
          .then((m) => {
            if (!cancelled) setMarkets(m ?? [])
          })
          .catch(() => {
            if (!cancelled) setMarkets([])
          })
      })
      .catch((rawError) => {
        if (!cancelled) setError(toAppError(rawError))
      })
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

  const handleCreateTournament = async (e) => {
    e.preventDefault()
    const name = newTournamentName.trim()
    if (!name) return

    setCreating(true)
    setActionError(null)
    try {
      const requestId = crypto.randomUUID()
      const result = await createTournament(requestId, name)
      if (result.status === 'created') {
        const created = {
          id: result.tournamentId,
          organizer_id: result.organizerId,
          game_id: result.gameId,
          format_id: result.formatId,
          name: result.name,
          status: result.tournamentStatus,
          version: 1,
          roster_frozen_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setTournaments((prev) => [created, ...(prev ?? [])])
        setNewTournamentName('')
      } else {
        setActionError(result.status)
      }
    } catch (rawError) {
      setActionError(toAppError(rawError).message)
    } finally {
      setCreating(false)
    }
  }

  const handleCloseRegistration = async (tournament) => {
    setPendingId(tournament.id)
    setActionError(null)
    try {
      const requestId = crypto.randomUUID()
      const result = await advanceTournamentState(requestId, tournament.id, 'CLOSE_REGISTRATION', tournament.version)
      if (result.status === 'transitioned') {
        setTournaments((prev) =>
          prev.map((t) => (t.id === tournament.id ? { ...t, status: result.newStatus, version: result.version } : t)),
        )
      } else {
        setActionError(result.status)
      }
    } catch (rawError) {
      setActionError(toAppError(rawError).message)
    } finally {
      setPendingId(null)
    }
  }

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
        No pudimos cargar tu panel de organizador ahora mismo.
      </p>
    )
  }

  if (!tournaments) return <p className="text-sm text-zinc-400">Cargando…</p>

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-zinc-50">Panel de organizador</h1>

      {/* Formulario de creación de torneo */}
      <form onSubmit={handleCreateTournament} className="flex flex-col gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
        <label htmlFor="tournament-name" className="text-xs font-medium text-zinc-300">
          Nuevo torneo
        </label>
        <div className="flex gap-2">
          <input
            id="tournament-name"
            type="text"
            placeholder="Nombre del torneo"
            value={newTournamentName}
            onChange={(e) => setNewTournamentName(e.target.value)}
            disabled={creating}
            className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newTournamentName.trim()}
            className="rounded bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
          >
            {creating ? 'Creando…' : 'Crear torneo'}
          </button>
        </div>
      </form>

      {/* Lista de torneos */}
      {tournaments.length === 0 && <p className="text-sm text-zinc-400">No organizás ningún torneo todavía.</p>}
      <ul className="flex flex-col gap-2">
        {tournaments.map((tournament) => (
          <li key={tournament.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-sm font-medium text-zinc-100">{tournament.name}</p>
            <p className="text-xs text-zinc-500">{tournament.status}</p>
            {tournament.status === 'REGISTRATION_OPEN' && (
              <button
                type="button"
                disabled={pendingId === tournament.id}
                onClick={() => handleCloseRegistration(tournament)}
                className="mt-2 rounded bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
              >
                Cerrar inscripciones
              </button>
            )}
          </li>
        ))}
      </ul>

      {actionError && (
        <p role="alert" data-testid="organizer-action-error" className="text-xs text-rose-400">
          {/FORBIDDEN/i.test(actionError)
            ? 'No tenés permiso para administrar este torneo.'
            : `No se pudo completar la acción (${actionError}).`}
        </p>
      )}

      {/* Sección Polymarket: Crear y Gestionar Mercados de Predicción */}
      <section className="mt-4 flex flex-col gap-4 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/30 via-zinc-900/60 to-zinc-950 p-5">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-violet-400" size={18} />
          <h2 className="text-sm font-bold text-zinc-50">Mercados de Predicción (Polymarket)</h2>
        </div>

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
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Torneo Asociado</label>
                <select
                  value={selectedTournamentId}
                  onChange={(e) => setSelectedTournamentId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-violet-500"
                >
                  {tournaments.map((t, idx) => (
                    <option key={t.id} value={t.id}>
                      Mercado #{idx + 1}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Categoría</label>
                <select
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
              <label className="block text-[11px] font-medium text-zinc-400 mb-1">Pregunta del Mercado</label>
              <input
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
    </div>
  )
}
