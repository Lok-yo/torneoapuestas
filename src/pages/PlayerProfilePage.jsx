import { useParams, Navigate } from 'react-router-dom'
import { getPlayerByUsername, overallRating, overallRecord } from '../data/players.js'
import { getGameById } from '../data/games.js'
import Avatar from '../components/Avatar.jsx'
import TierBadge from '../components/TierBadge.jsx'
import GameTag from '../components/GameTag.jsx'
import { formatDate } from '../lib/format.js'
import { getTierInfo } from '../lib/tiers.js'

export default function PlayerProfilePage() {
  const { username } = useParams()
  const player = getPlayerByUsername(username)
  if (!player) return <Navigate to="/ranking" replace />

  const record = overallRecord(player)
  const rating = overallRating(player)
  const { nextTier, nextTierIn } = getTierInfo(rating)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
        <Avatar username={player.username} size={64} />
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">@{player.username}</h1>
          <p className="text-xs text-zinc-500">Miembro desde {formatDate(player.joinedAt)}</p>
          <div className="mt-2 flex items-center gap-2">
            <TierBadge rating={rating} />
            <span className="text-xs text-zinc-500">
              {record.wins}V-{record.losses}D general
            </span>
          </div>
          {nextTier && (
            <p className="mt-1 text-xs text-zinc-600">
              {nextTierIn} pts para {nextTier}
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Estadísticas por juego
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {player.games.map((g) => {
            const game = getGameById(g.gameId)
            return (
              <div
                key={g.gameId}
                className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <div className="flex items-center justify-between">
                  <GameTag game={game} />
                  <TierBadge rating={g.rating} />
                </div>
                <div className="flex items-center justify-between text-sm text-zinc-400">
                  <span>Rating</span>
                  <span className="font-semibold text-zinc-100">{g.rating}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-zinc-400">
                  <span>Récord</span>
                  <span className="text-zinc-200">
                    {g.wins}V-{g.losses}D
                  </span>
                </div>
                <div className="flex gap-1">
                  {g.recentForm.map((r, i) => (
                    <span
                      key={i}
                      className={`h-1.5 w-5 rounded-full ${r === 'W' ? 'bg-emerald-400' : 'bg-rose-400'}`}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
