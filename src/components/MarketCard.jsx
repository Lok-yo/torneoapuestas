import { Link } from 'react-router-dom'
import { getMatchById } from '../data/matches.js'
import { getPlayerById } from '../data/players.js'
import { getGameById } from '../data/games.js'
import MarketProbabilityBar from './MarketProbabilityBar.jsx'
import GameTag from './GameTag.jsx'
import { formatTCRED } from '../lib/format.js'

export default function MarketCard({ market }) {
  const match = getMatchById(market.matchId)
  const playerA = getPlayerById(match.playerAId)
  const playerB = getPlayerById(match.playerBId)
  const game = getGameById(market.gameId)

  return (
    <Link
      to={`/mercados/${market.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 transition hover:border-zinc-700"
    >
      <div className="flex items-center justify-between">
        <GameTag game={game} />
        <span className="text-xs text-zinc-500">{formatTCRED(market.volumeTCRED)} vol.</span>
      </div>
      <p className="font-medium text-zinc-100">
        @{playerA.username} <span className="text-zinc-600">vs</span> @{playerB.username}
      </p>
      <MarketProbabilityBar market={market} />
    </Link>
  )
}
