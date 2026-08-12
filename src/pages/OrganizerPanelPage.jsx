// Organizer panel: lists the current user's own tournaments and lets
// them close registration on one. Gated by <RequireAuth role="organizer">
// at the router level (see App.jsx) — the first real production usage of
// RequireAuth's role prop (built in Phase 2, unused by any route until
// now). See tasks.md 6.3 and design.md threat matrix "forbidden→denial":
// the route-level role check is a client-side UX gate only; the
// advance_tournament_state RPC (0008_lifecycle_rpc.sql) is the actual
// authority and denies the action server-side regardless of what the
// client's session/role state claims.
// KNOWN GAP (see App.jsx's route registration comment): no migration
// currently grants the 'organizer' role, so this page is unreachable
// through any documented flow yet. Left as-is rather than gate-removed —
// removing the role prop would break e2e/session-routing.spec.js's
// threat-matrix coverage for this exact route.
import { useEffect, useState } from 'react'
import { useSession } from '../auth/SessionProvider.jsx'
import { listTournaments, advanceTournamentState } from '../repositories/tournamentRepository.js'
import { toAppError } from '../lib/errors.js'

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
        setTournaments(all.filter((t) => t.organizer_id === session?.user?.id))
      })
      .catch((rawError) => {
        if (!cancelled) setError(toAppError(rawError))
      })
    return () => {
      cancelled = true
    }
  }, [session])

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
        // Includes the server-side denial path: even if this route was
        // reached with a forged/stale client-side role claim, the RPC's
        // own has_role() check is the real authority and can still
        // refuse the action here.
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
      <h1 className="text-xl font-semibold text-zinc-50">Panel de organizador</h1>
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
    </div>
  )
}
