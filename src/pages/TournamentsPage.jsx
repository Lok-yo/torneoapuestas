// Real backend-wired tournament list: async loading/error/empty states,
// no fixture fallback. See tasks.md 3.13 and tournament-operations spec
// "Public projection and closed perimeter".
import { useMemo } from 'react'
import { useAsync } from '../lib/useAsync.js'
import { Link, useSearchParams } from 'react-router-dom'
import { listTournaments } from '../repositories/tournamentRepository.js'
import { getGameById, GAMES } from '../data/games.js'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'
import GameCover from '../components/GameCover.jsx'

export default function TournamentsPage() {
  const { status, data: tournaments, error } = useAsync(() => listTournaments(), [])
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
        <p className="mt-1 text-[13px] text-[#8a8680]">Torneos oficiales de Super Smash Bros. Ultimate.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            params.delete('juego')
            setParams(params)
          }}
          className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
            !gameFilter ? 'bg-[#b6ff3a] text-[#0a0c08]' : 'border border-[#2a3140] text-[#9aa3b2]'
          }`}
        >
          Todos
        </button>
        {GAMES.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => {
              params.set('juego', g.id)
              setParams(params)
            }}
            className={`px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider ${
              gameFilter === g.id ? 'bg-[#b6ff3a] text-[#0a0c08]' : 'border border-[#2a3140] text-[#9aa3b2]'
            }`}
          >
            {g.shortName}
          </button>
        ))}
      </div>

      {status === 'loading' && <p className="py-10 text-center text-[13px] text-[#6f6b64]">Cargando torneos…</p>}

      {status === 'error' && (
        <p className="py-10 text-center text-[13px] text-[#b11226]">
          No pudimos cargar los torneos ahora mismo. {error?.message}
        </p>
      )}

      {status === 'ready' && rows.length === 0 && (
        <p className="py-10 text-center text-[13px] text-[#6f6b64]">Todavía no hay torneos publicados.</p>
      )}

      {status === 'ready' && rows.length > 0 && (
        <div className="border border-[#242424]">
          <div className="hidden grid-cols-[56px_1fr_auto_auto] gap-3 border-b border-[#242424] px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-[#6f6b64] sm:grid">
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
                className="grid grid-cols-[56px_1fr] items-center gap-3 border-b border-[#1a1a1a] px-4 py-3 last:border-0 hover:bg-[#111] sm:grid-cols-[56px_1fr_auto_auto]"
              >
                {game ? <GameCover game={game} className="h-14 w-10" /> : <span />}
                <div className="min-w-0">
                  <h2 className="truncate text-[14px] text-[#edeae3]">{tournament.name}</h2>
                  <p className="text-[12px] text-[#6f6b64]">{game?.shortName ?? tournament.game_id}</p>
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
