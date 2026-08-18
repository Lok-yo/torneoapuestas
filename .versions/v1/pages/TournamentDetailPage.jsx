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
import { ArrowLeft, Users, Swords, GitBranch } from 'lucide-react'
import { getTournament, getTournamentFormat } from '../repositories/tournamentRepository.js'
import { getBracket } from '../repositories/bracketRepository.js'
import { getGameById } from '../data/games.js'
import { useSession } from '../auth/SessionProvider.jsx'
import GameTag from '../components/GameTag.jsx'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import TournamentPredictionWidget from '../components/TournamentPredictionWidget.jsx'
import { toAppError } from '../lib/errors.js'

const TIMELINE = [
  { key: 'REGISTRATION_OPEN', label: 'Registro' },
  { key: 'REGISTRATION_CLOSED', label: 'Fase de Grupos' },
  { key: 'IN_PROGRESS', label: 'Top 8' },
  { key: 'COMPLETED', label: 'Finalizado' },
]

const TIMELINE_ORDER = {
  DRAFT: 0,
  REGISTRATION_OPEN: 1,
  REGISTRATION_CLOSED: 2,
  IN_PROGRESS: 3,
  COMPLETED: 4,
  CANCELLED: -1,
}

export default function TournamentDetailPage() {
  const { id } = useParams()
  const { status: sessionStatus, session } = useSession()
  const [state, setState] = useState({ status: 'loading', tournament: null, format: null, error: null })
  const [bracket, setBracket] = useState([])
  const [tab, setTab] = useState('descripcion')

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
    <div className="flex flex-col gap-4">
      <Link to="/torneos" className="inline-flex items-center gap-1 text-[12px] text-[#6d7566] hover:text-[#ddd6c4]">
        <ArrowLeft size={14} /> Torneos
      </Link>

      {state.status === 'loading' && <p className="py-12 text-center text-[13px] text-[#6d7566]">Cargando torneo…</p>}

      {state.status === 'error' && (
        <p className="py-12 text-center text-[13px] text-[#ff4d5a]">
          No pudimos cargar este torneo ahora mismo. {state.error?.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <TournamentHeader tournament={state.tournament} format={state.format} />
          <StatusTimeline status={state.tournament.status} />

          {/* Retired: registration, organizer lifecycle controls,
              bracket-generation button, and the official-result submission
              form. Tournaments (and their rosters/results) will be sourced
              from the external start.gg API instead of managed here — see
              openspec/changes/p2p-crypto-prediction-markets/. The read-only
              bracket display below and the prediction markets widget remain
              live and unaffected. */}

          <div className="flex border border-[#243028] bg-[#0c1410]">
            {[
              { id: 'descripcion', label: 'Descripción' },
              { id: 'brackets', label: 'Brackets' },
              { id: 'predicciones', label: 'Predicciones' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex-1 px-3 py-2 text-[12px] font-bold uppercase tracking-wide ${
                  tab === item.id
                    ? 'bg-[#162016] text-[#c9a227] shadow-[inset_0_-2px_0_#c9a227]'
                    : 'text-[#7d8574] hover:text-[#ddd6c4]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'descripcion' && <DescriptionPanel tournament={state.tournament} format={state.format} />}
          {tab === 'brackets' && <BracketSection bracket={bracket} />}
          {tab === 'predicciones' && (
            <TournamentPredictionWidget tournamentId={state.tournament.id} isOrganizer={isOrganizer} />
          )}
        </>
      )}
    </div>
  )
}

function StatusTimeline({ status }) {
  if (status === 'CANCELLED') {
    return (
      <div className="border border-[#243028] bg-[#0c1410] px-3 py-2 text-[12px] text-[#6d7566]">
        Este torneo fue cancelado.
      </div>
    )
  }

  const current = TIMELINE_ORDER[status] ?? 0

  return (
    <ol className="grid grid-cols-4 border border-[#243028] bg-[#0c1410]">
      {TIMELINE.map((step, i) => {
        const stepIndex = i + 1
        const done = current > stepIndex
        const active = current === stepIndex || (status === 'DRAFT' && stepIndex === 1)
        return (
          <li
            key={step.key}
            className={`border-r border-[#243028] px-2 py-2 last:border-r-0 ${
              active ? 'bg-[#1a2410] text-[#c9a227]' : done ? 'text-[#8dff4a]' : 'text-[#5c6458]'
            }`}
          >
            <div className="flex items-center justify-between font-mono text-[10px] uppercase">
              <span>0{stepIndex}</span>
              {active && <span className="live-pip" />}
            </div>
            <p className="font-display text-[12px] font-bold uppercase">{step.label}</p>
          </li>
        )
      })}
    </ol>
  )
}

function TournamentHeader({ tournament, format }) {
  const game = getGameById(tournament.game_id)
  return (
    <div className="relative overflow-hidden border border-[#243028] bg-[#0c1410]">
      {game?.banner && (
        <img
          src={game.banner}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#070c09] via-[#070c09]/85 to-transparent" />
      <div className="relative flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          {game && <GameTag game={game} />}
          <TournamentStatusBadge status={tournament.status} />
        </div>
        <h1 className="font-display text-3xl font-extrabold uppercase leading-none text-[#f3ead0]">{tournament.name}</h1>
        {format && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#b8b09a]">
            <span className="inline-flex items-center gap-1">
              <Users size={13} />
              {format.roster_size} jugadores
            </span>
            <span className="inline-flex items-center gap-1">
              <Swords size={13} />
              Mejor de {format.best_of}
            </span>
            <span>Eliminación simple</span>
          </div>
        )}
      </div>
    </div>
  )
}

function DescriptionPanel({ tournament, format }) {
  const game = getGameById(tournament.game_id)
  return (
    <div className="border border-[#243028] bg-[#0c1410] p-4">
      <p className="font-display text-[11px] font-bold tracking-[0.16em] text-[#c9a227]">FICHA</p>
      <h2 className="font-display text-xl font-bold uppercase text-[#f0e6c8]">Ficha del torneo</h2>
      <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="border border-[#243028] px-3 py-2">
          <dt className="text-[11px] text-[#6d7566]">Juego</dt>
          <dd className="text-[#ddd6c4]">{game?.name ?? tournament.game_id}</dd>
        </div>
        <div className="border border-[#243028] px-3 py-2">
          <dt className="text-[11px] text-[#6d7566]">Estado</dt>
          <dd className="text-[#ddd6c4]">{tournament.status}</dd>
        </div>
        {format && (
          <>
            <div className="border border-[#243028] px-3 py-2">
              <dt className="text-[11px] text-[#6d7566]">Formato</dt>
              <dd className="text-[#ddd6c4]">{format.name ?? 'Eliminación simple'}</dd>
            </div>
            <div className="border border-[#243028] px-3 py-2">
              <dt className="text-[11px] text-[#6d7566]">Roster</dt>
              <dd className="font-mono text-[#ddd6c4]">
                {format.roster_size} · BO{format.best_of}
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  )
}

function BracketSection({ bracket }) {
  if (bracket.length === 0) {
    return <p className="py-8 text-center text-[13px] text-[#6d7566]">El bracket todavía no fue generado.</p>
  }

  const rounds = [...new Set(bracket.map((m) => m.round))].sort((a, b) => a - b)

  return (
    <div className="overflow-x-auto border border-[#243028] bg-[#0c1410] p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#9aa090]">
        <GitBranch size={14} className="text-[#c9a227]" />
        Árbol del bracket
      </div>
      <div className="flex min-w-max gap-6">
        {rounds.map((round) => {
          const matches = bracket.filter((m) => m.round === round)
          return (
            <div key={round} className="flex min-w-[220px] flex-col">
              <h2 className="mb-2 font-display text-[12px] font-bold uppercase tracking-[0.14em] text-[#6d7566]">
                Ronda {round}
              </h2>
              <div className="flex flex-1 flex-col justify-around gap-4" style={{ minHeight: `${Math.max(matches.length, 1) * 88}px` }}>
                {matches.map((match) => (
                  <MatchCard key={match.match_id} match={match} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MatchCard({ match }) {
  const nameA = match.participant_a_username ?? 'Por definir'
  const nameB = match.participant_b_username ?? 'Por definir'
  const hasScore = match.games_won_a != null
  const aWins = hasScore && match.games_won_a > match.games_won_b
  const bWins = hasScore && match.games_won_b > match.games_won_a

  return (
    <div className="border border-[#243028] bg-[#10180f]">
      <div className={`flex items-center justify-between border-b border-[#243028] px-2.5 py-1.5 text-[13px] ${aWins ? 'bg-[#143016] text-[#8dff4a]' : 'text-[#ddd6c4]'}`}>
        <span className="truncate">{nameA}</span>
        <span className="ml-3 font-mono text-[11px] text-[#8a9080]">{hasScore ? match.games_won_a : '—'}</span>
      </div>
      <div className={`flex items-center justify-between px-2.5 py-1.5 text-[13px] ${bWins ? 'bg-[#143016] text-[#8dff4a]' : 'text-[#ddd6c4]'}`}>
        <span className="truncate">{nameB}</span>
        <span className="ml-3 font-mono text-[11px] text-[#8a9080]">{hasScore ? match.games_won_b : '—'}</span>
      </div>
      {!hasScore && (
        <div className="border-t border-[#243028] px-2 py-0.5 text-center font-mono text-[10px] uppercase text-[#5c6458]">
          vs
        </div>
      )}
    </div>
  )
}
