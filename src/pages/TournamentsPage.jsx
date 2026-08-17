// Real backend-wired tournament list: async loading/error/empty states,
// no fixture fallback. See tasks.md 3.13 and tournament-operations spec
// "Public projection and closed perimeter".
import { useAsync } from '../lib/useAsync.js'
import { Link } from 'react-router-dom'
import { listTournaments } from '../repositories/tournamentRepository.js'
import { getGameById } from '../data/games.js'
import GameTag from '../components/GameTag.jsx'
import TournamentStatusBadge from '../components/TournamentStatusBadge.jsx'

export default function TournamentsPage() {
  const { status, data: tournaments, error } = useAsync(() => listTournaments(), [])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Torneos</h1>
        <p className="text-sm text-zinc-400">Torneos oficiales de Super Smash Bros. Ultimate.</p>
      </div>

      {status === 'loading' && (
        <p className="py-12 text-center text-sm text-zinc-500">Cargando torneos…</p>
      )}

      {status === 'error' && (
        <p className="py-12 text-center text-sm text-rose-400">
          No pudimos cargar los torneos ahora mismo. {error?.message}
        </p>
      )}

      {status === 'ready' && (tournaments ?? []).length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">Todavía no hay torneos publicados.</p>
      )}

      {status === 'ready' && (tournaments ?? []).length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(tournaments ?? []).map((tournament) => {
            const game = getGameById(tournament.game_id)
            return (
              <Link
                key={tournament.id}
                to={`/torneos/${tournament.id}`}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-700"
              >
                <div className="flex items-center justify-between">
                  {game && <GameTag game={game} />}
                  <TournamentStatusBadge status={tournament.status} />
                </div>
                <h2 className="text-sm font-semibold text-zinc-100">{tournament.name}</h2>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
