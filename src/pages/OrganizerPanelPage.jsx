import { useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider.jsx'
import { listTournaments, advanceTournamentState } from '../repositories/tournamentRepository.js'
import { toAppError } from '../lib/errors.js'
import PredictionMarketAdminPanel from '../components/PredictionMarketAdminPanel.jsx'

export default function OrganizerPanelPage() {
  const { session } = useSession()
  const [tournaments, setTournaments] = useState(null)
  const [error, setError] = useState(null)
  const [pendingId, setPendingId] = useState(null)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    let cancelled = false
    listTournaments()
      .then((all) => {
        if (cancelled) return
        const own = session?.user?.id ? all.filter((t) => t.organizer_id === session?.user?.id) : all
        setTournaments(own)
      })
      .catch((rawError) => {
        if (!cancelled) setError(toAppError(rawError))
      })
    return () => {
      cancelled = true
    }
  }, [session?.user?.id])

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
      <div>
        <p className="kicker">Backstage</p>
        <h1 className="mt-1 font-display text-4xl font-bold text-white">Panel de organizador</h1>
      </div>

      {/* Retired: tournament-creation form. Tournaments will be sourced
          from the external start.gg API instead of created here — see
          openspec/changes/p2p-crypto-prediction-markets/. The read-only
          tournament list below (and its lifecycle action, still backed by
          the existing advance_tournament_state RPC/0008 migration) and the
          prediction-market admin panel remain live and unaffected. */}

      {/* Lista de torneos */}
      {tournaments.length === 0 && <p className="text-sm text-zinc-400">No organizás ningún torneo todavía.</p>}
      <ul className="flex flex-col gap-2">
        {tournaments.map((tournament) => (
          <li key={tournament.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3 backdrop-blur-md">
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

      <PredictionMarketAdminPanel />
    </div>
  )
}
