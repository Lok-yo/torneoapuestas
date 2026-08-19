// Real backend-wired leaderboard: async loading/error/empty states, no
// fixture fallback. Reads public_leaderboard_view (via ratingRepository),
// which is derived strictly from accepted official results — never
// simulated/predicted. See tasks.md 4.7/4.9 and rating-projections spec
// "Public leaderboard and privacy boundary".
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Crown, Search, Trophy } from 'lucide-react'
import { getLeaderboard } from '../repositories/ratingRepository.js'
import { getGameById } from '../data/games.js'
import GameTabs from '../components/GameTabs.jsx'
import Avatar from '../components/Avatar.jsx'
import TierBadge from '../components/TierBadge.jsx'
import { formatDate } from '../lib/format.js'
import { useAsync } from '../lib/useAsync.js'
import { getTierInfo } from '../lib/tiers.js'

const PODIUM_META = [
  { place: 1, label: 'Oro', height: 'h-36', glow: 'podium-glow-gold', ring: 'from-amber-300 to-yellow-600' },
  { place: 2, label: 'Plata', height: 'h-28', glow: 'podium-glow-silver', ring: 'from-zinc-200 to-zinc-500' },
  { place: 3, label: 'Bronce', height: 'h-24', glow: 'podium-glow-bronze', ring: 'from-orange-300 to-amber-800' },
]

export default function LeaderboardPage() {
  const [gameId, setGameId] = useState(null)
  const [query, setQuery] = useState('')
  const { status, data: rows, error } = useAsync(() => getLeaderboard(gameId), [gameId])
  const list = rows ?? []
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((row) => String(row.username || '').toLowerCase().includes(q))
  }, [list, query])
  const podium = filtered.slice(0, 3)
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="kicker">Clasificación</p>
        <h1 className="mt-1 font-display text-4xl font-bold text-white">Ranking</h1>
        <p className="text-[13px] text-[#8a8680]">
          Puntaje derivado de resultados oficiales de torneo, por juego o en conjunto.
        </p>
      </div>
      <GameTabs activeId={gameId} onChange={setGameId} />

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-3 text-zinc-500" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar jugador…"
          aria-label="Buscar jugador"
          className="w-full border border-[#242424] bg-[#0c0c0c] py-2 pl-9 pr-3 text-sm text-[#edeae3] outline-none focus:border-[#b11226]"
        />
      </div>

      {status === 'loading' && <p className="py-12 text-center text-sm text-zinc-500">Cargando ranking…</p>}

      {status === 'error' && (
        <p className="py-12 text-center text-sm text-rose-400">
          No pudimos cargar el ranking ahora mismo. {error?.message}
        </p>
      )}

      {status === 'ready' && list.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Trophy size={32} className="text-zinc-600" />
          <h2 className="font-display text-lg font-bold text-zinc-300">Sin datos aún</h2>
          <p className="max-w-xs text-[13px] text-zinc-500">
            Todavía no hay resultados oficiales que generen ranking.
          </p>
          <Link to="/cartelera" className="mt-1 text-[12px] font-semibold text-rose-500 hover:text-rose-400">
            Explorar torneos →
          </Link>
        </div>
      )}

      {status === 'ready' && filtered.length > 0 && (
        <>
          {podium.length >= 1 && (
            <div className="grid items-end gap-3 sm:grid-cols-3">
              {(podium.length === 1 ? podium : podiumOrder).map((row) => {
                const place = filtered.indexOf(row) + 1
                const meta = PODIUM_META[place - 1] ?? PODIUM_META[2]
                const tier = getTierInfo(row.rating)
                return (
                  <Link
                    key={`${row.game_id}-${row.username}-podium`}
                    to={`/jugadores/${row.username}`}
                    className={`flex flex-col items-center gap-3 border border-[#242424] bg-[#0c0c0c] p-5 text-center ${place === 1 ? 'border-[#b11226]' : ''}`}
                  >
                    {place === 1 && <Crown size={20} className="crown-shimmer text-amber-300" />}
                    <div className={`rounded-full bg-gradient-to-br p-[2px] ${meta.ring}`}>
                      <Avatar username={row.username} size={place === 1 ? 72 : 56} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-zinc-50">@{row.username}</p>
                      <p className="font-mono text-xs text-zinc-400">
                        #{place} · {row.rating}
                      </p>
                    </div>
                    <TierBadge rating={row.rating} />
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">{tier.tier}</p>
                  </Link>
                )
              })}
            </div>
          )}

          <div className="overflow-x-auto border border-[#242424] bg-[#0c0c0c]">
            <table className="w-full text-sm">
              <thead className="bg-[#111] text-left text-[10px] uppercase tracking-wide text-[#6f6b64]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    #
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Jugador
                  </th>
                  {!gameId && (
                    <th scope="col" className="px-4 py-3 font-medium">
                      Juego
                    </th>
                  )}
                  <th scope="col" className="px-4 py-3 font-medium">
                    Tier
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Rating
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Actualizado
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const game = getGameById(row.game_id)
                  return (
                    <tr
                      key={`${row.game_id}-${row.username}`}
                      className="border-t border-[#1a1a1a] transition hover:bg-[#111]"
                    >
                      <td className="px-4 py-3 font-mono text-zinc-500">{i + 1}</td>
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
                      <td className="px-4 py-3 text-right font-mono font-medium text-zinc-200">{row.rating}</td>
                      <td className="px-4 py-3 text-right text-zinc-500">{formatDate(row.computed_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
