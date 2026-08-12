import { useEffect, useState } from 'react'
import { Flame, Activity } from 'lucide-react'
import { listMarkets } from '../repositories/marketRepository.js'

export default function LiveBetTicker() {
  const [activities, setActivities] = useState([])

  useEffect(() => {
    let cancelled = false
    listMarkets()
      .then((markets) => {
        if (cancelled || !markets || markets.length === 0) return
        // Generate activity ticker items based on active prediction markets
        const items = markets.flatMap((m) =>
          (m.market_outcomes || []).map((o) => ({
            id: `${m.id}-${o.id}`,
            question: m.question,
            outcome: o.label,
            price: o.price ? (o.price * 100).toFixed(0) : 50,
            shares: o.total_shares || 10,
          })),
        )
        setActivities(items)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  if (activities.length === 0) return null

  return (
    <div className="w-full overflow-hidden rounded-2xl border border-violet-500/20 bg-zinc-950/80 p-3 shadow-lg">
      <div className="flex items-center gap-2 mb-2 px-2 text-xs font-semibold text-violet-400">
        <Activity size={14} className="animate-pulse" />
        <span className="uppercase tracking-wider text-[11px]">Tendencias en Vivo (Polymarket)</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin scrollbar-thumb-zinc-800">
        {activities.map((act) => (
          <div
            key={act.id}
            className="flex flex-shrink-0 items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs transition hover:border-violet-500/40"
          >
            <Flame size={14} className="text-amber-400" />
            <div className="flex flex-col">
              <span className="font-medium text-zinc-200 text-[11px] truncate max-w-[200px]">{act.question}</span>
              <span className="text-[10px] text-zinc-400">
                Opción: <strong className="text-violet-300">{act.outcome}</strong> ({act.price}% prob)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
