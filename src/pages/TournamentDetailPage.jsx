// Real backend-wired tournament detail: registration/withdrawal,
// organizer lifecycle controls, bracket generation, and a role-gated
// official-result form. Every write here is a UX affordance only — the
// database grants and RPCs (0008-0011_*.sql) remain the real authority,
// so a hidden/disabled button here is never itself a security boundary.
// See tasks.md 3.13 and tournament-operations spec.
import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import {
  getTournament,
  getTournamentFormat,
  getOwnMembership,
  registerParticipant,
  withdrawParticipant,
  advanceTournamentState,
} from '../repositories/tournamentRepository.js'
import { getBracket, generateBracket } from '../repositories/bracketRepository.js'
import { submitOfficialResult } from '../repositories/resultRepository.js'
import { getGameById } from '../data/games.js'
import { allowedActions } from '../domain/tournaments/lifecycle.js'
import { useSession } from '../auth/SessionProvider.jsx'
import GameTag from '../components/GameTag.jsx'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import { toAppError } from '../lib/errors.js'

const ACTION_LABEL = {
  OPEN_REGISTRATION: 'Abrir inscripciones',
  CLOSE_REGISTRATION: 'Cerrar inscripciones',
  START: 'Iniciar torneo',
  COMPLETE: 'Finalizar torneo',
  CANCEL: 'Cancelar torneo',
}

export default function TournamentDetailPage() {
  const { id } = useParams()
  const { status: sessionStatus, session, hasRole } = useSession()
  const [state, setState] = useState({ status: 'loading', tournament: null, format: null, error: null })
  const [membership, setMembership] = useState(null)
  const [bracket, setBracket] = useState([])
  const [pending, setPending] = useState(null)
  const [actionError, setActionError] = useState(null)

  const userId = sessionStatus === 'authenticated' ? session?.user?.id : null

  const load = useCallback(async () => {
    try {
      const tournament = await getTournament(id)
      if (!tournament) {
        setState({ status: 'not_found', tournament: null, format: null, error: null })
        return
      }
      const [format, bracketRows, ownMembership] = await Promise.all([
        getTournamentFormat(tournament.format_id),
        getBracket(tournament.id),
        userId ? getOwnMembership(tournament.id, userId) : Promise.resolve(null),
      ])
      setState({ status: 'ready', tournament, format, error: null })
      setBracket(bracketRows)
      setMembership(ownMembership)
    } catch (rawError) {
      setState({ status: 'error', tournament: null, format: null, error: toAppError(rawError) })
    }
  }, [id, userId])

  useEffect(() => {
    load()
  }, [load])

  if (state.status === 'not_found') return <Navigate to="/torneos" replace />

  const isOrganizer = state.tournament && userId === state.tournament.organizer_id
  const canSubmitResults = isOrganizer || hasRole('referee')

  const runAction = async (label, fn) => {
    setPending(label)
    setActionError(null)
    try {
      await fn()
      await load()
    } catch (rawError) {
      setActionError(toAppError(rawError).message)
    } finally {
      setPending(null)
    }
  }

  const handleRegister = () =>
    runAction('register', async () => {
      const requestId = crypto.randomUUID()
      const result = await registerParticipant(requestId, state.tournament.id)
      if (result.status === 'roster_full') throw new Error('El roster ya está completo.')
      if (result.status === 'closed') throw new Error('Las inscripciones no están abiertas.')
    })

  const handleWithdraw = () =>
    runAction('withdraw', async () => {
      const requestId = crypto.randomUUID()
      const result = await withdrawParticipant(requestId, state.tournament.id)
      if (result.status === 'frozen') throw new Error('El roster ya está congelado; no podés darte de baja.')
    })

  const handleLifecycleAction = (action) =>
    runAction(action, async () => {
      const requestId = crypto.randomUUID()
      const result = await advanceTournamentState(requestId, state.tournament.id, action, state.tournament.version)
      if (result.status === 'version_conflict') throw new Error('El torneo cambió mientras tanto. Recargá e intentá de nuevo.')
      if (result.status === 'invalid_transition') throw new Error('Esa transición no es válida en el estado actual.')
    })

  const handleGenerateBracket = () =>
    runAction('bracket', async () => {
      const requestId = crypto.randomUUID()
      const result = await generateBracket(requestId, state.tournament.id)
      if (result.status === 'incomplete_roster') throw new Error('El roster todavía no está completo.')
      if (result.status === 'invalid_state') throw new Error('Cerrá las inscripciones antes de generar el bracket.')
    })

  return (
    <div className="flex flex-col gap-8">
      <Link to="/torneos" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
        <ArrowLeft size={14} /> Torneos
      </Link>

      {state.status === 'loading' && <p className="py-12 text-center text-sm text-zinc-500">Cargando torneo…</p>}

      {state.status === 'error' && (
        <p className="py-12 text-center text-sm text-rose-400">
          No pudimos cargar este torneo ahora mismo. {state.error?.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <TournamentHeader tournament={state.tournament} format={state.format} />

          {actionError && <p className="text-sm text-rose-400">{actionError}</p>}

          <RegistrationPanel
            sessionStatus={sessionStatus}
            tournament={state.tournament}
            membership={membership}
            pending={pending}
            onRegister={handleRegister}
            onWithdraw={handleWithdraw}
          />

          {isOrganizer && (
            <OrganizerPanel
              tournament={state.tournament}
              bracketExists={bracket.length > 0}
              pending={pending}
              onAction={handleLifecycleAction}
              onGenerateBracket={handleGenerateBracket}
            />
          )}

          <BracketSection bracket={bracket} canSubmitResults={canSubmitResults} onReload={load} />
        </>
      )}
    </div>
  )
}

function TournamentHeader({ tournament, format }) {
  const game = getGameById(tournament.game_id)
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
      <div className="flex items-center justify-between">
        {game && <GameTag game={game} />}
        <TournamentStatusBadge status={tournament.status} />
      </div>
      <h1 className="text-2xl font-semibold text-zinc-50">{tournament.name}</h1>
      {format && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <Users size={14} />
            {format.roster_size} jugadores
          </span>
          <span>Mejor de {format.best_of}</span>
          <span>Eliminación simple</span>
        </div>
      )}
    </div>
  )
}

function RegistrationPanel({ sessionStatus, tournament, membership, pending, onRegister, onWithdraw }) {
  if (sessionStatus !== 'authenticated') {
    return (
      <p className="text-sm text-zinc-500">
        <Link to="/login" className="underline">
          Iniciá sesión
        </Link>{' '}
        para inscribirte en este torneo.
      </p>
    )
  }

  if (tournament.status !== 'REGISTRATION_OPEN') return null

  const registered = membership?.status === 'REGISTERED'

  return (
    <div className="flex items-center gap-3">
      {registered ? (
        <button
          type="button"
          disabled={pending === 'withdraw'}
          onClick={onWithdraw}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-600 disabled:opacity-60"
        >
          {pending === 'withdraw' ? 'Procesando…' : 'Darme de baja'}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending === 'register'}
          onClick={onRegister}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
        >
          {pending === 'register' ? 'Procesando…' : 'Inscribirme'}
        </button>
      )}
    </div>
  )
}

function OrganizerPanel({ tournament, bracketExists, pending, onAction, onGenerateBracket }) {
  const actions = allowedActions(tournament.status)

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Panel del organizador</h2>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={pending === action}
            onClick={() => onAction(action)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600 disabled:opacity-60"
          >
            {pending === action ? 'Procesando…' : ACTION_LABEL[action]}
          </button>
        ))}
        {tournament.status === 'REGISTRATION_CLOSED' && !bracketExists && (
          <button
            type="button"
            disabled={pending === 'bracket'}
            onClick={onGenerateBracket}
            className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
          >
            {pending === 'bracket' ? 'Generando…' : 'Generar bracket'}
          </button>
        )}
      </div>
    </div>
  )
}

function BracketSection({ bracket, canSubmitResults, onReload }) {
  if (bracket.length === 0) {
    return <p className="py-8 text-center text-sm text-zinc-500">El bracket todavía no fue generado.</p>
  }

  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b)

  return (
    <div className="flex flex-col gap-8">
      {rounds.map((round) => (
        <div key={round}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Ronda {round}</h2>
          <div className="flex flex-col gap-3">
            {bracket
              .filter((m) => m.round === round)
              .map((match) => (
                <MatchCard
                  key={match.match_id}
                  match={match}
                  canSubmitResults={canSubmitResults}
                  onReload={onReload}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MatchCard({ match, canSubmitResults, onReload }) {
  const [scoreA, setScoreA] = useState('')
  const [scoreB, setScoreB] = useState('')
  const [formPending, setFormPending] = useState(false)
  const [formError, setFormError] = useState(null)

  const nameA = match.participant_a_username ?? 'Por definir'
  const nameB = match.participant_b_username ?? 'Por definir'
  const canSubmit = canSubmitResults && match.status === 'READY'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormPending(true)
    setFormError(null)
    try {
      const requestId = crypto.randomUUID()
      const result = await submitOfficialResult(requestId, match.match_id, Number(scoreA), Number(scoreB))
      if (result.status === 'invalid_score') {
        setFormError('El resultado no es válido para el formato al mejor de 3.')
        return
      }
      if (result.status === 'not_completable') {
        setFormError('Este partido ya no está disponible para cargar resultado.')
        return
      }
      await onReload()
    } catch (rawError) {
      setFormError(toAppError(rawError).message)
    } finally {
      setFormPending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between text-sm text-zinc-200">
        <span>{nameA}</span>
        <span className="text-xs text-zinc-500">
          {match.games_won_a != null ? `${match.games_won_a} - ${match.games_won_b}` : 'vs'}
        </span>
        <span>{nameB}</span>
      </div>

      {canSubmit && (
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            max="2"
            required
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
            className="w-14 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-sm text-zinc-100"
          />
          <span className="text-xs text-zinc-500">-</span>
          <input
            type="number"
            min="0"
            max="2"
            required
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
            className="w-14 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-sm text-zinc-100"
          />
          <button
            type="submit"
            disabled={formPending}
            className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
          >
            {formPending ? 'Guardando…' : 'Cargar resultado'}
          </button>
        </form>
      )}

      {formError && <p className="text-xs text-rose-400">{formError}</p>}
    </div>
  )
}
