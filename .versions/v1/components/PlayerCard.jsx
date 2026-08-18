import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import TierBadge from './TierBadge.jsx'
import { getPlayerGameStats } from '../data/players.js'

export default function PlayerCard({ player, gameId, align = 'left' }) {
  const stats = getPlayerGameStats(player, gameId)

  return (
    <Link
      to={`/jugadores/${player.username}`}
      className={`flex items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}
    >
      <Avatar username={player.username} />
      <div>
        <p className="font-medium text-zinc-100">@{player.username}</p>
        {stats && (
          <div
            className={`mt-0.5 flex items-center gap-2 text-xs text-zinc-400 ${align === 'right' ? 'flex-row-reverse' : ''}`}
          >
            <TierBadge rating={stats.rating} />
            <span>
              {stats.wins}V-{stats.losses}D
            </span>
          </div>
        )}
      </div>
    </Link>
  )
}
