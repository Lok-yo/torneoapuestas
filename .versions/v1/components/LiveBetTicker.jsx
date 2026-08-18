import { useEffect, useState } from 'react'
import { Flame, Activity } from 'lucide-react'
import { listMarkets } from '../repositories/marketRepository.js'

function TickerChip({ act }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2.5 rounded-xl border border-white/8 bg-zinc-900/70 px-3 py-2 text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <Flame size={14} className="text-amber-400" />
      <div className="flex flex-col">
        <span className="max-w-[220px] truncate text-[11px] font-medium text-zinc-200">{act.question}</span>
        <span className="font-mono text-[10px] text-zinc-400">
          <strong className="text-violet-300">{act.outcome}</strong>
          <span className="mx-1.5 text-zinc-700">·</span>
          <span className="text-emerald-400">{act.price}%</span>
          <span className="mx-1.5 text-zinc-700">·</span>
          {act.shares} sh
        </span>
      </div>
    </div>
  )
}

export default function LiveBetTicker() {
  const [activities, setActivities] = useState([])

  useEffect(() => {
    let cancelled = false
    listMarkets()
      .then((markets) => {
        if (cancelled || !markets || markets.length === 0) return
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

  const loop = [...activities, ...activities]

  return (
    <div className="bento overflow-hidden p-3 hover:border-violet-500/30">
      <div className="mb-2 flex items-center gap-2 px-2 text-xs font-semibold text-violet-300">
        <Activity size={14} className="animate-pulse" />
        <span className="uppercase tracking-[0.18em] text-[10px]">Live Tape</span>
        <span className="live-dot ml-1" />
      </div>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[#0d0f17] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[#0d0f17] to-transparent" />
        <div className="ticker-track gap-3 pr-3">
          {loop.map((act, i) => (
            <TickerChip key={`${act.id}-${i}`} act={act} />
          ))}
        </div>
      </div>
    </div>
  )
}
