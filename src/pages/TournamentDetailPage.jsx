import { useParams, Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Calendar, Trophy, Users } from 'lucide-react'
import { getTournamentById } from '../data/tournaments.js'
import { matchesForTournament } from '../data/matches.js'
import { getGameById } from '../data/games.js'
import GameTag from '../components/GameTag.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import MatchRow from '../components/MatchRow.jsx'
import { formatDate, formatTCRED } from '../lib/format.js'

export default function TournamentDetailPage() {
  const { id } = useParams()
  const tournament = getTournamentById(id)
  if (!tournament) return <Navigate to="/torneos" replace />

  const game = getGameById(tournament.gameId)
  const matches = matchesForTournament(tournament.id)
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b)

  return (
    <div className="flex flex-col gap-8">
      <Link
        to="/torneos"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft size={14} /> Torneos
      </Link>

      <div className="flex flex-col gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
        <div className="flex items-center justify-between">
          <GameTag game={game} />
          <StatusBadge status={tournament.status} />
        </div>
        <h1 className="text-2xl font-semibold text-zinc-50">{tournament.name}</h1>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-400">
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
          <span>{tournament.format}</span>
        </div>
      </div>

      <div className="flex flex-col gap-8">
        {rounds.map((round) => (
          <div key={round}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
              {matches.find((m) => m.round === round).roundName}
            </h2>
            <div className="flex flex-col gap-3">
              {matches
                .filter((m) => m.round === round)
                .map((m) => (
                  <MatchRow key={m.id} match={m} />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
