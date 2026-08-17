// Tournament detail: read-only tournament/bracket display plus prediction
// markets. The registration, organizer lifecycle-control, bracket-generation,
// and official-result-submission panels that used to live here have been
// retired from the UI — see the retirement comment below and
// openspec/changes/p2p-crypto-prediction-markets/ for the direction this
// page is moving in. Every write that remains (prediction-market writes) is
// a UX affordance only — the database grants and RPCs remain the real
// authority, so a hidden/disabled control here is never itself a security
// boundary. See tasks.md 3.13 and tournament-operations spec.
import { useCallback, useEffect, useState } from 'react'
import { useParams, Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Users } from 'lucide-react'
import { getTournament, getTournamentFormat } from '../repositories/tournamentRepository.js'
import { getBracket } from '../repositories/bracketRepository.js'
import { getGameById } from '../data/games.js'
import { useSession } from '../auth/SessionProvider.jsx'
import GameTag from '../components/GameTag.jsx'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import TournamentPredictionWidget from '../components/TournamentPredictionWidget.jsx'
import { toAppError } from '../lib/errors.js'

export default function TournamentDetailPage() {
  const { id } = useParams()
  const { status: sessionStatus, session } = useSession()
  const [state, setState] = useState({ status: 'loading', tournament: null, format: null, error: null })
  const [bracket, setBracket] = useState([])

  const userId = sessionStatus === 'authenticated' ? session?.user?.id : null

  const load = useCallback(async () => {
    try {
      const tournament = await getTournament(id)
      if (!tournament) {
        setState({ status: 'not_found', tournament: null, format: null, error: null })
        return
      }
      const [format, bracketRows] = await Promise.all([
        getTournamentFormat(tournament.format_id),
        getBracket(tournament.id),
      ])
      setState({ status: 'ready', tournament, format, error: null })
      setBracket(bracketRows)
    } catch (rawError) {
      setState({ status: 'error', tournament: null, format: null, error: toAppError(rawError) })
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (state.status === 'not_found') return <Navigate to="/torneos" replace />

  const isOrganizer = state.tournament && userId === state.tournament.organizer_id

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

          {/* Retired: registration, organizer lifecycle controls,
              bracket-generation button, and the official-result submission
              form. Tournaments (and their rosters/results) will be sourced
              from the external start.gg API instead of managed here — see
              openspec/changes/p2p-crypto-prediction-markets/. The read-only
              bracket display below and the prediction markets widget remain
              live and unaffected. */}

          <TournamentPredictionWidget tournamentId={state.tournament.id} isOrganizer={isOrganizer} />

          <BracketSection bracket={bracket} />
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

function BracketSection({ bracket }) {
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
                <MatchCard key={match.match_id} match={match} />
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MatchCard({ match }) {
  const nameA = match.participant_a_username ?? 'Por definir'
  const nameB = match.participant_b_username ?? 'Por definir'

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-center justify-between text-sm text-zinc-200">
        <span>{nameA}</span>
        <span className="text-xs text-zinc-500">
          {match.games_won_a != null ? `${match.games_won_a} - ${match.games_won_b}` : 'vs'}
        </span>
        <span>{nameB}</span>
      </div>
    </div>
  )
}
