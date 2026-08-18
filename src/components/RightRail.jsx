import { Link } from 'react-router-dom'
import { listTournaments } from '../repositories/tournamentRepository.js'
import { listMarkets } from '../repositories/marketRepository.js'
import { useAsync } from '../lib/useAsync.js'
import { getGameById } from '../data/games.js'
import GameCover from './GameCover.jsx'
import TournamentStatusBadge from './TournamentStatusBadge.jsx'

const LIVE = new Set(['IN_PROGRESS', 'REGISTRATION_OPEN'])

export default function RightRail() {
  const { data: tournaments } = useAsync(() => listTournaments(), [])
  const { data: markets } = useAsync(() => listMarkets().catch(() => []), [])

  const live = (tournaments ?? []).filter((t) => LIVE.has(t.status)).slice(0, 5)
  const tape = (markets ?? [])
    .flatMap((m) =>
      (m.market_outcomes || []).slice(0, 2).map((o) => ({
        id: `${m.id}-${o.id}`,
        marketId: m.id,
        question: m.question,
        label: o.label,
        price: o.price ? Math.round(Number(o.price) * 100) : 50,
      })),
    )
    .slice(0, 8)

  return (
    <aside className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#3a1218] px-4 py-3">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#b6ff3a]">
          <span className="live-pip" /> En pista
        </span>
        <span className="font-mono text-[10px] text-[#6f6b64]">{live.length}</span>
      </div>

      <div className="flex flex-col">
        {live.length === 0 && (
          <p className="px-4 py-5 text-[12px] text-[#6f6b64]">No hay eventos en curso ahora.</p>
        )}
        {live.map((t) => {
          const game = getGameById(t.game_id)
          return (
            <Link
              key={t.id}
              to={`/torneos/${t.id}`}
              className="flex gap-3 border-b border-[#1a0a0c] px-4 py-3 hover:bg-[#140808]"
            >
              {game && <GameCover game={game} className="h-14 w-10 shrink-0" />}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-white">{t.name}</p>
                <div className="mt-1.5">
                  <TournamentStatusBadge status={t.status} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {tape.length > 0 && (
        <div className="border-t border-[#3a1218]">
          <p className="kicker px-4 py-3">Cinta</p>
          <div className="flex flex-col">
            {tape.map((row) => (
              <Link
                key={row.id}
                to={`/mercados/${row.marketId}`}
                className="flex items-start justify-between gap-3 border-b border-[#1a0a0c] px-4 py-3 hover:bg-[#140808]"
              >
                <span className="line-clamp-2 text-[12px] text-[#8a8680]">{row.question}</span>
                <span className="odds-btn shrink-0">
                  {row.label} {row.price}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="mt-auto border-t border-[#242424] px-4 py-4 text-[11px] leading-relaxed text-[#5a5650]">
        Crédito de mesa <span className="font-mono text-[#b6ff3a]">TCRED</span> — ficha de simulación, sin valor
        de cambio.
      </p>
    </aside>
  )
}
