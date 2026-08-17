// Real backend-wired leaderboard: async loading/error/empty states, no
// fixture fallback. Reads public_leaderboard_view (via ratingRepository),
// which is derived strictly from accepted official results — never
// simulated/predicted. See tasks.md 4.7/4.9 and rating-projections spec
// "Public leaderboard and privacy boundary".
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getLeaderboard } from '../repositories/ratingRepository.js'
import { getGameById } from '../data/games.js'
import GameTabs from '../components/GameTabs.jsx'
import Avatar from '../components/Avatar.jsx'
import TierBadge from '../components/TierBadge.jsx'
import { formatDate } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'

export default function LeaderboardPage() {
  const [gameId, setGameId] = useState(null)
  const { status, data: rows, error } = useAsync(() => getLeaderboard(gameId), [gameId])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Ranking</h1>
        <p className="text-sm text-zinc-400">
          Puntaje derivado de resultados oficiales de torneo, por juego o en conjunto.
        </p>
      </div>
      <GameTabs activeId={gameId} onChange={setGameId} />

      {status === 'loading' && (
        <p className="py-12 text-center text-sm text-zinc-500">Cargando ranking…</p>
      )}

      {status === 'error' && (
        <p className="py-12 text-center text-sm text-rose-400">
          No pudimos cargar el ranking ahora mismo. {error?.message}
        </p>
      )}

      {status === 'ready' && (rows ?? []).length === 0 && (
        <p className="py-12 text-center text-sm text-zinc-500">
          Todavía no hay resultados oficiales que generen ranking.
        </p>
      )}

      {status === 'ready' && (rows ?? []).length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">#</th>
                <th scope="col" className="px-4 py-3 font-medium">Jugador</th>
                {!gameId && <th scope="col" className="px-4 py-3 font-medium">Juego</th>}
                <th scope="col" className="px-4 py-3 font-medium">Tier</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Rating</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Actualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {(rows ?? []).map((row, i) => {
                const game = getGameById(row.game_id)
                return (
                  <tr key={`${row.game_id}-${row.username}`} className="transition hover:bg-zinc-900/60">
                    <td className="px-4 py-3 text-zinc-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <Link to={`/jugadores/${row.username}`} className="flex items-center gap-2">
                        <Avatar username={row.username} size={28} />
                        <span className="font-medium text-zinc-100">@{row.username}</span>
                      </Link>
                    </td>
                    {!gameId && <td className="px-4 py-3 text-zinc-400">{game?.shortName ?? row.game_id}</td>}
                    <td className="px-4 py-3">
                      <TierBadge rating={row.rating} />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-zinc-200">{row.rating}</td>
                    <td className="px-4 py-3 text-right text-zinc-500">{formatDate(row.computed_at)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
