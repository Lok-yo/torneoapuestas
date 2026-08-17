// Real backend-wired player profile: async loading/error/empty states, no
// fixture fallback. Reads public_leaderboard_view (current rating per
// game) and public_player_history_view (versioned event history) via
// ratingRepository — never the private profiles/rating_events/
// rating_snapshots tables directly. See tasks.md 4.7/4.9 and
// rating-projections spec "Public leaderboard and privacy boundary".
//
// Stage 1 scope note: the public views deliberately expose only
// competitive fields (username, rating, delta history), never join date,
// avatar, or any other identity detail — so a username with zero results
// yet is indistinguishable here from one that doesn't exist. Rather than
// guessing/redirecting, this page shows the same truthful empty state
// either way; it never fabricates a "not found" verdict it cannot back
// with real profile data.
import { useParams } from 'react-router-dom'
import { getPlayerRatings, getPlayerHistory } from '../repositories/ratingRepository.js'
import { getGameById } from '../data/games.js'
import Avatar from '../components/Avatar.jsx'
import TierBadge from '../components/TierBadge.jsx'
import GameTag from '../components/GameTag.jsx'
import { formatDateTime } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'

export default function PlayerProfilePage() {
  const { username } = useParams()
  const { status, data, error } = useAsync(
    () => Promise.all([getPlayerRatings(username), getPlayerHistory(username)]),
    [username],
  )
  const ratings = data?.[0] ?? []
  const history = data?.[1] ?? []

  if (status === 'loading') {
    return <p className="py-12 text-center text-sm text-zinc-500">Cargando perfil…</p>
  }

  if (status === 'error') {
    return (
      <p className="py-12 text-center text-sm text-rose-400">
        No pudimos cargar este perfil ahora mismo. {error?.message}
      </p>
    )
  }

  const bestRating = ratings.length > 0 ? Math.max(...ratings.map((r) => r.rating)) : 0

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
        <Avatar username={username} size={64} />
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">@{username}</h1>
          {ratings.length > 0 ? (
            <div className="mt-2 flex items-center gap-2">
              <TierBadge rating={bestRating} />
              <span className="text-xs text-zinc-500">Mejor rating entre sus juegos</span>
            </div>
          ) : (
            <p className="mt-2 text-xs text-zinc-500">Todavía no hay resultados oficiales para este jugador.</p>
          )}
        </div>
      </div>

      {ratings.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Rating por juego
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {ratings.map((r) => {
              const game = getGameById(r.game_id)
              return (
                <div
                  key={r.game_id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"
                >
                  <div className="flex items-center justify-between">
                    {game ? <GameTag game={game} /> : <span className="text-sm text-zinc-300">{r.game_id}</span>}
                    <TierBadge rating={r.rating} />
                  </div>
                  <div className="flex items-center justify-between text-sm text-zinc-400">
                    <span>Rating</span>
                    <span className="font-semibold text-zinc-100">{r.rating}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>Versión {r.version}</span>
                    <span>Actualizado {formatDateTime(r.computed_at)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Historial de resultados
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-medium">Juego</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Cambio</th>
                  <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {history.map((h, i) => (
                  <tr key={`${h.game_id}-${h.effective_at}-${i}`}>
                    <td className="px-4 py-3 text-zinc-400">{formatDateTime(h.effective_at)}</td>
                    <td className="px-4 py-3 text-zinc-300">{getGameById(h.game_id)?.shortName ?? h.game_id}</td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${h.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                    >
                      {h.delta >= 0 ? '+' : ''}
                      {h.delta}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {h.review_state === 'NEEDS_REVIEW' ? 'En revisión' : 'Confirmado'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
