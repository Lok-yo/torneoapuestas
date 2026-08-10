import { useState } from 'react'
import { PLAYERS, overallRating, overallRecord, getPlayerGameStats } from '../data/players.js'
import GameTabs from '../components/GameTabs.jsx'
import LeaderboardTable from '../components/LeaderboardTable.jsx'

export default function LeaderboardPage() {
  const [gameId, setGameId] = useState(null)

  const rows = (
    gameId
      ? PLAYERS.filter((p) => getPlayerGameStats(p, gameId)).map((p) => {
          const stats = getPlayerGameStats(p, gameId)
          return { player: p, rating: stats.rating, wins: stats.wins, losses: stats.losses }
        })
      : PLAYERS.map((p) => {
          const record = overallRecord(p)
          return { player: p, rating: overallRating(p), wins: record.wins, losses: record.losses }
        })
  ).sort((a, b) => b.rating - a.rating)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Ranking</h1>
        <p className="text-sm text-zinc-400">Puntaje y nivel de cada jugador, por juego o general.</p>
      </div>
      <GameTabs activeId={gameId} onChange={setGameId} />
      <LeaderboardTable rows={rows} />
    </div>
  )
}
