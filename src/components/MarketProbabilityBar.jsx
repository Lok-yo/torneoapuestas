import { formatPercent } from '../lib/format.js'

export default function MarketProbabilityBar({ market, compact = false }) {
  const yesPct = market.yesPrice

  if (compact) {
    return (
      <div className="flex w-32 items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full bg-emerald-400" style={{ width: `${yesPct * 100}%` }} />
        </div>
        <span className="w-9 text-right text-xs font-semibold text-emerald-400">
          {formatPercent(yesPct)}
        </span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-emerald-400">Sí {formatPercent(yesPct)}</span>
        <span className="font-medium text-rose-400">No {formatPercent(1 - yesPct)}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-emerald-400" style={{ width: `${yesPct * 100}%` }} />
        <div className="h-full bg-rose-400" style={{ width: `${(1 - yesPct) * 100}%` }} />
      </div>
    </div>
  )
}
