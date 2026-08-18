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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[11px] font-bold tracking-[0.18em] text-[#c9a227]">CARTELERA</p>
          <h1 className="font-display text-3xl font-extrabold uppercase leading-none text-[#f0e6c8]">Torneos</h1>
          <p className="mt-1 text-[13px] text-[#8a9080]">Torneos oficiales de Super Smash Bros. Ultimate.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => {
            params.delete('juego')
            setParams(params)
          }}
          className={`px-2 py-1 text-[11px] font-bold uppercase ${
            !gameFilter ? 'bg-[#c9a227] text-[#141208]' : 'border border-[#2a382c] text-[#9aa090]'
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
            className={`px-2 py-1 text-[11px] font-bold uppercase ${
              gameFilter === g.id ? 'bg-[#c9a227] text-[#141208]' : 'border border-[#2a382c] text-[#9aa090]'
            }`}
          >
            {g.shortName}
          </button>
        ))}
      </div>

      {status === 'loading' && <p className="py-10 text-center text-[13px] text-[#6d7566]">Cargando torneos…</p>}

      {status === 'error' && (
        <p className="py-10 text-center text-[13px] text-[#ff4d5a]">
          No pudimos cargar los torneos ahora mismo. {error?.message}
        </p>
      )}

      {status === 'ready' && rows.length === 0 && (
        <p className="py-10 text-center text-[13px] text-[#6d7566]">Todavía no hay torneos publicados.</p>
      )}

      {status === 'ready' && rows.length > 0 && (
        <div className="border border-[#243028] bg-[#0c1410]">
          <div className="hidden grid-cols-[56px_1fr_auto_auto] gap-3 border-b border-[#243028] px-3 py-1.5 text-[10px] uppercase tracking-wider text-[#5c6458] sm:grid">
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
                className="grid grid-cols-[56px_1fr] items-center gap-3 border-b border-[#1b251e] px-3 py-2 last:border-0 hover:bg-[#121a14] sm:grid-cols-[56px_1fr_auto_auto]"
              >
                {game ? <GameCover game={game} className="h-14 w-10" /> : <span />}
                <div className="min-w-0">
                  <h2 className="truncate text-[13px] font-semibold text-[#f0e6c8]">{tournament.name}</h2>
                  <p className="text-[11px] text-[#6d7566]">{game?.shortName ?? tournament.game_id}</p>
                </div>
                <div className="hidden sm:block">
                  <TournamentStatusBadge status={tournament.status} />
                </div>
                <span className="odds-btn hidden sm:inline-block">ABRIR</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
