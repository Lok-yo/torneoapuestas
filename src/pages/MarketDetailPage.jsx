import { useParams, Link, Navigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { getMarketById } from '../data/markets.js'
import { getMatchById } from '../data/matches.js'
import { getPlayerById } from '../data/players.js'
import { getGameById } from '../data/games.js'
import GameTag from '../components/GameTag.jsx'
import StatusBadge from '../components/StatusBadge.jsx'
import PlayerCard from '../components/PlayerCard.jsx'
import MarketProbabilityBar from '../components/MarketProbabilityBar.jsx'
import MarketPriceChart from '../components/MarketPriceChart.jsx'
import PredictionWidget from '../components/PredictionWidget.jsx'
import BuySharesPanel from '../components/BuySharesPanel.jsx'
import { formatTCRED, formatDateTime } from '../lib/format.js'

export default function MarketDetailPage() {
  const { id } = useParams()
  const market = getMarketById(id)
  if (!market) return <Navigate to="/torneos" replace />

  const match = getMatchById(market.matchId)
  const playerA = getPlayerById(match.playerAId)
  const playerB = getPlayerById(match.playerBId)
  const game = getGameById(market.gameId)

  return (
    <div className="flex flex-col gap-8">
      <Link
        to={`/torneos/${match.tournamentId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300"
      >
        <ArrowLeft size={14} /> Volver al torneo
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <GameTag game={game} />
            <StatusBadge status={match.status} />
            <span className="text-xs text-zinc-500">
              {match.roundName} · {formatDateTime(match.scheduledAt)}
            </span>
          </div>

          <h1 className="text-xl font-semibold text-zinc-50">{market.question}</h1>

          <div className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <PlayerCard player={playerA} gameId={market.gameId} />
            <span className="text-sm text-zinc-600">vs</span>
            <PlayerCard player={playerB} gameId={market.gameId} align="right" />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <MarketProbabilityBar market={market} />
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <div className="mb-3 flex items-center justify-between text-sm text-zinc-400">
              <span>Historial de precio</span>
              <span>{formatTCRED(market.volumeTCRED)} de volumen</span>
            </div>
            <MarketPriceChart priceHistory={market.priceHistory} />
          </div>

          <PredictionWidget playerA={playerA} playerB={playerB} gameId={market.gameId} />
        </div>

        <div className="flex flex-col gap-4">
          <BuySharesPanel market={market} />
        </div>
      </div>
    </div>
  )
}
