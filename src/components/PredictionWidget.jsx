import { calculatePrediction } from '../lib/prediction.js'
import { formatPercent } from '../lib/format.js'

export default function PredictionWidget({ playerA, playerB, gameId }) {
  const { probA, probB, factors } = calculatePrediction(playerA, playerB, gameId)

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h3 className="mb-1 text-sm font-semibold text-zinc-200">Predicción del sistema</h3>
      <p className="mb-4 text-xs text-zinc-500">
        Estimación automática en base a rating y forma reciente — no es un consejo de apuesta.
      </p>

      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-300">@{playerA.username}</span>
        <span className="font-semibold text-zinc-50">{formatPercent(probA)}</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-violet-400" style={{ width: `${probA * 100}%` }} />
      </div>

      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium text-zinc-300">@{playerB.username}</span>
        <span className="font-semibold text-zinc-50">{formatPercent(probB)}</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full bg-zinc-500" style={{ width: `${probB * 100}%` }} />
      </div>

      <ul className="space-y-1 border-t border-zinc-800 pt-3 text-xs text-zinc-500">
        {factors.map((f) => (
          <li key={f.label} className="flex justify-between">
            <span>{f.label}</span>
            <span>
              {formatPercent(f.probA)} a favor de @{playerA.username}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
