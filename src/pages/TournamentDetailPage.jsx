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
import { ArrowLeft, Users, Swords } from 'lucide-react'
import { getTournament, getTournamentFormat, listTournamentSets } from '../repositories/tournamentRepository.js'
import { getGameById } from '../data/games.js'
import { useSession } from '../auth/SessionProvider.jsx'
import GameTag from '../components/GameTag.jsx'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import TournamentPredictionWidget from '../components/TournamentPredictionWidget.jsx'
import BracketSection from '../components/BracketSection.jsx'
import CreateMarketModal from '../components/CreateMarketModal.jsx'
import ErrorBoundary from '../components/ErrorBoundary.jsx'
import { toAppError } from '../lib/errors.js'
import { derivePhase } from '../lib/tournamentPhase.js'

const TIMELINE = [
  { step: 1, label: 'Registro' },
  { step: 2, label: 'Fase de Grupos' },
  { step: 3, label: 'Top 8' },
  { step: 4, label: 'Finalizado' },
]

export default function TournamentDetailPage() {
  const { id } = useParams()
  const { status: sessionStatus, session } = useSession()
  const [state, setState] = useState({ status: 'loading', tournament: null, format: null, sets: [], error: null })
  const [tab, setTab] = useState('descripcion')
  const [selectedSet, setSelectedSet] = useState(null)

  const userId = sessionStatus === 'authenticated' ? session?.user?.id : null

  const load = useCallback(async () => {
    try {
      const tournament = await getTournament(id)
      if (!tournament) {
        setState({ status: 'not_found', tournament: null, format: null, sets: [], error: null })
        return
      }
      const [format, sets] = await Promise.all([
        getTournamentFormat(tournament.format_id),
        listTournamentSets(tournament.id).catch(() => []),
      ])
      setState({ status: 'ready', tournament, format, sets, error: null })
    } catch (rawError) {
      setState({ status: 'error', tournament: null, format: null, sets: [], error: toAppError(rawError) })
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (state.status === 'not_found') return <Navigate to="/torneos" replace />

  const isOrganizer = state.tournament && userId === state.tournament.organizer_id

  return (
    <div className="flex flex-col gap-4">
      <Link to="/torneos" className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-100">
        <ArrowLeft size={14} /> Torneos
      </Link>

      {state.status === 'loading' && <p className="py-12 text-center text-[13px] text-zinc-500">Cargando torneo…</p>}

      {state.status === 'error' && (
        <p className="py-12 text-center text-[13px] text-rose-700">
          No pudimos cargar este torneo ahora mismo. {state.error?.message}
        </p>
      )}

      {state.status === 'ready' && (
        <>
          <TournamentHeader tournament={state.tournament} format={state.format} />
          <StatusTimeline status={state.tournament.status} sets={state.sets} />

          {/* Retired: registration, organizer lifecycle controls,
              bracket-generation button, and the official-result submission
              form. Tournaments (and their rosters/results) will be sourced
              from the external start.gg API instead of managed here — see
              openspec/changes/p2p-crypto-prediction-markets/. The read-only
              bracket display below and the prediction markets widget remain
              live and unaffected. */}

          <div role="tablist" className="flex border border-zinc-800 bg-zinc-950">
            {[
              { id: 'descripcion', label: 'Descripción' },
              { id: 'brackets', label: 'Brackets' },
              { id: 'predicciones', label: 'Predicciones' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                aria-controls={`panel-${item.id}`}
                id={`tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`flex-1 px-3 py-2 text-[12px] font-bold uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-rose-700 ${
                  tab === item.id
                    ? 'bg-zinc-900 text-rose-700 shadow-[inset_0_-2px_0_#be123c]'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'descripcion' && <div id="panel-descripcion" role="tabpanel" aria-labelledby="tab-descripcion"><DescriptionPanel tournament={state.tournament} format={state.format} sets={state.sets} /></div>}
          {tab === 'brackets' && (
            <div id="panel-brackets" role="tabpanel" aria-labelledby="tab-brackets">
              <ErrorBoundary>
                <BracketSection
                  tournamentId={state.tournament.id}
                  sets={state.sets}
                  onSelectSet={setSelectedSet}
                />
              </ErrorBoundary>
            </div>
          )}
          {tab === 'predicciones' && (
            <div id="panel-predicciones" role="tabpanel" aria-labelledby="tab-predicciones">
              <TournamentPredictionWidget tournamentId={state.tournament.id} isOrganizer={isOrganizer} />
            </div>
          )}
        </>
      )}

      {selectedSet && state.tournament && (
        <CreateMarketModal
          set={selectedSet}
          startggEventId={state.tournament.startgg_event_id}
          onClose={() => setSelectedSet(null)}
        />
      )}
    </div>
  )
}

function StatusTimeline({ status, sets }) {
  if (status === 'CANCELLED') {
    return (
      <div className="border border-zinc-800 bg-zinc-950 px-3 py-2 text-[12px] text-zinc-500">
        Este torneo fue cancelado.
      </div>
    )
  }

  const phase = derivePhase(status, sets)

  return (
    <ol className="grid grid-cols-4 border border-zinc-800 bg-zinc-950">
      {TIMELINE.map((step, i) => {
        const stepIndex = i + 1
        const done = phase && phase.step > stepIndex
        const active = phase && phase.step === stepIndex
        return (
          <li
            key={step.step}
            className={`border-r border-zinc-800 px-2 py-2 last:border-r-0 ${
              active ? 'bg-rose-950 text-rose-700' : done ? 'text-rose-700' : 'text-zinc-600'
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
    <div className="relative overflow-hidden border border-zinc-800 bg-zinc-950">
      {game?.banner && (
        <img
          src={game.banner}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/85 to-transparent" />
      <div className="relative flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          {game && <GameTag game={game} />}
          <TournamentStatusBadge status={tournament.status} />
        </div>
        <h1 className="font-display text-4xl font-bold text-white">{tournament.name}</h1>
        {format && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-zinc-400">
            <span className="inline-flex items-center gap-1">
              <Users size={13} />
              {format.roster_size} jugadores
            </span>
            <span className="inline-flex items-center gap-1">
              <Swords size={13} />
              Mejor de {format.best_of}
            </span>
            <span>{format.bracket_type === 'single_elimination' ? 'Eliminación simple' : format.bracket_type || 'Eliminación simple'}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function DescriptionPanel({ tournament, format, sets }) {
  const game = getGameById(tournament.game_id)
  const phase = derivePhase(tournament.status, sets)
  const eventDate = tournament.created_at
    ? new Date(tournament.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-4">
      <p className="font-display text-[11px] font-bold tracking-[0.16em] text-rose-700">FICHA</p>
      <h2 className="font-display text-xl font-bold uppercase text-zinc-100">Ficha del torneo</h2>
      <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="border border-zinc-800 px-3 py-2">
          <dt className="text-[11px] text-zinc-500">Juego</dt>
          <dd className="text-zinc-100">{game?.name ?? tournament.game_id}</dd>
        </div>
        <div className="border border-zinc-800 px-3 py-2">
          <dt className="text-[11px] text-zinc-500">Estado</dt>
          <dd className="text-zinc-100">{tournament.status}</dd>
        </div>
        {phase && (
          <div className="border border-zinc-800 px-3 py-2">
            <dt className="text-[11px] text-zinc-500">Fase</dt>
            <dd className="font-mono text-rose-400">{phase.label}</dd>
          </div>
        )}
        <div className="border border-zinc-800 px-3 py-2">
          <dt className="text-[11px] text-zinc-500">Fecha</dt>
          <dd className="text-zinc-100">{eventDate ?? '—'}</dd>
        </div>
        {format && (
          <>
            <div className="border border-zinc-800 px-3 py-2">
              <dt className="text-[11px] text-zinc-500">Formato</dt>
              <dd className="text-zinc-100">{format.name ?? 'Eliminación simple'}</dd>
            </div>
            <div className="border border-zinc-800 px-3 py-2">
              <dt className="text-[11px] text-zinc-500">Roster</dt>
              <dd className="font-mono text-zinc-100">
                {format.roster_size} · BO{format.best_of}
              </dd>
            </div>
          </>
        )}
      </dl>
    </div>
  )
}
