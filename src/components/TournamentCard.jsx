import { Link } from 'react-router-dom'
import { Trophy, Users, Calendar } from 'lucide-react'
import GameTag from './GameTag.jsx'
import StatusBadge from './StatusBadge.jsx'
import { getGameById } from '../data/games.js'
import { formatDate, formatTCRED } from '../lib/format.js'

export default function TournamentCard({ tournament }) {
  const game = getGameById(tournament.gameId)

  return (
    <Link
      to={`/torneos/${tournament.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-700 hover:bg-zinc-900"
    >
      <div className="flex items-center justify-between">
        <GameTag game={game} />
        <StatusBadge status={tournament.status} />
      </div>
      <h3 className="text-lg font-semibold text-zinc-50 group-hover:text-white">{tournament.name}</h3>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-400">
        <span className="inline-flex items-center gap-1">
          <Calendar size={14} />
          {formatDate(tournament.startDate)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={14} />
          {tournament.participantIds.length} jugadores
        </span>
        <span className="inline-flex items-center gap-1">
          <Trophy size={14} />
          {formatTCRED(tournament.prizePoolTCRED)}
        </span>
      </div>
    </Link>
  )
}
