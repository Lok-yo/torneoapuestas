// Real backend-wired tournament list: async loading/error/empty states,
// no fixture fallback. See tasks.md 3.13 and tournament-operations spec
// "Public projection and closed perimeter".
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getGameById, GAMES } from '../data/games.js'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import GameCover from '../components/GameCover.jsx'
import { useTournaments } from '../hooks/useTournaments.js'
import { Trophy } from 'lucide-react'

export default function TournamentsPage() {
  const { status, data: tournaments, error } = useTournaments()
  const [params, setParams] = useSearchParams()
  const gameFilter = params.get('juego')
  const q = (params.get('q') || '').trim().toLowerCase()

  const rows = useMemo(() => {
    let list = tournaments ?? []
    if (gameFilter) list = list.filter((t) => t.game_id === gameFilter)
    if (q) list = list.filter((t) => String(t.name || '').toLowerCase().includes(q))
    return list
  }, [tournaments, gameFilter, q])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="kicker">Cartelera</p>
        <h1 className="mt-1 font-display text-4xl font-bold text-white">Torneos</h1>
        <p className="mt-1 text-[13px] text-zinc-500">Torneos oficiales de Super Smash Bros. Ultimate.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          aria-pressed={!gameFilter}
          onClick={() => {
            params.delete('juego')
            setParams(params)
          }}
          className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
            !gameFilter ? 'bg-lime text-[#0a0c08]' : 'border border-zinc-700 text-zinc-400'
          }`}
        >
          Todos
        </button>
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={gameFilter === g.id}
            onClick={() => {
              params.set('juego', g.id)
              setParams(params)
            }}
            className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
              gameFilter === g.id ? 'bg-lime text-[#0a0c08]' : 'border border-zinc-700 text-zinc-400'
            }`}
          >
            {g.shortName}
          </button>
        ))}
      </div>

      {status === 'loading' && (
        <div className="border border-zinc-800/60">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-zinc-800/40 px-4 py-3.5 last:border-0">
              <div className="h-14 w-10 animate-pulse bg-zinc-800" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-800" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-zinc-800" />
              </div>
            </div>
          ))}
        </div>
      )}

      {status === 'error' && (
        <p className="py-10 text-center text-[13px] text-hot">
          No pudimos cargar los torneos ahora mismo. {error?.message}
        </p>
      )}

      {status === 'ready' && rows.length === 0 && (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800/60">
            <Trophy size={24} className="text-zinc-500" />
          </div>
          <div>
            <p className="text-[14px] font-semibold text-zinc-300">Todavía no hay torneos</p>
            <p className="mt-1 text-[13px] text-zinc-500">Cuando se publiquen eventos, aparecerán aquí.</p>
          </div>
          <Link to="/" className="btn-lime mt-2 px-5 py-2.5 text-[12px]">
            Volver al inicio
          </Link>
        </div>
      )}

      {/* TODO: TournamentCard component was retired (dead code, legacy model).
          Tournament rows are rendered inline here and in HomePage. */}
      {status === 'ready' && rows.length > 0 && (
        <div className="border border-zinc-800/60">
          <div className="hidden grid-cols-[56px_1fr_auto_auto] gap-3 border-b border-zinc-800/60 px-4 py-2.5 text-[10px] uppercase tracking-[0.16em] text-zinc-500 sm:grid">
            <span>Juego</span>
            <span>Evento</span>
            <span>Estado</span>
            <span className="text-right">Línea</span>
          </div>
          {rows.map((tournament) => {
            const game = getGameById(tournament.game_id)
            return (
              <Link
                key={tournament.id}
                to={`/torneos/${tournament.id}`}
                className="grid grid-cols-[56px_1fr] items-center gap-3 border-b border-zinc-800/60 px-4 py-3.5 last:border-0 bg-zinc-900/20 transition-colors duration-150 hover:bg-zinc-800/60 sm:grid-cols-[56px_1fr_auto_auto]"
              >
                {game ? <GameCover game={game} className="h-14 w-10" /> : <span />}
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] text-zinc-100">{tournament.name}</h2>
                  <p className="text-[12px] text-zinc-500">{game?.shortName ?? tournament.game_id}</p>
                </div>
                <div className="hidden sm:block">
                  <TournamentStatusBadge status={tournament.status} />
                </div>
                <span className="odds-btn hidden sm:inline-block">Abrir</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
