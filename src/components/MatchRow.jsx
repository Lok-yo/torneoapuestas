import { Link } from 'react-router-dom'
import { getPlayerById } from '../data/players.js'
import { getMarketByMatchId } from '../data/markets.js'
import Avatar from './Avatar.jsx'
import StatusBadge from './StatusBadge.jsx'
import MarketProbabilityBar from './MarketProbabilityBar.jsx'
import { formatDateTime } from '../lib/format.js'

export default function MatchRow({ match }) {
  const playerA = getPlayerById(match.playerAId)
  const playerB = getPlayerById(match.playerBId)
  const market = getMarketByMatchId(match.id)
  const winner = match.winnerId

  return (
    <Link
      to={market ? `/mercados/${market.id}` : '#'}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-700 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-2 ${winner === playerA.id ? 'text-zinc-50' : 'text-zinc-400'}`}
        >
          <Avatar username={playerA.username} size={28} />
          <span className="font-medium">@{playerA.username}</span>
        </div>
        <span className="text-xs text-zinc-600">vs</span>
        <div
          className={`flex items-center gap-2 ${winner === playerB.id ? 'text-zinc-50' : 'text-zinc-400'}`}
        >
          <Avatar username={playerB.username} size={28} />
          <span className="font-medium">@{playerB.username}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-500">
          {match.roundName} · {formatDateTime(match.scheduledAt)}
        </span>
        <StatusBadge status={match.status} />
        {market && <MarketProbabilityBar market={market} compact />}
      </div>
    </Link>
  )
}
