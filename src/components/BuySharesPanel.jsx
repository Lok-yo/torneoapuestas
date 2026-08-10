import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../store/useSessionStore.js'
import { useWalletStore } from '../store/useWalletStore.js'
import { formatTCRED, formatPercent } from '../lib/format.js'

export default function BuySharesPanel({ market }) {
  const [side, setSide] = useState('YES')
  const [amount, setAmount] = useState(50)
  const [feedback, setFeedback] = useState(null)
  const navigate = useNavigate()
  const user = useSessionStore((s) => s.user)
  const balance = useWalletStore((s) => s.balance)
  const buyShares = useWalletStore((s) => s.buyShares)

  if (market.resolved) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-400">
        Este mercado ya está resuelto — el resultado fue{' '}
        <strong className="text-zinc-200">{market.resolvedSide === 'YES' ? 'Sí' : 'No'}</strong>.
      </div>
    )
  }

  if (!user?.username) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-center">
        <p className="mb-3 text-sm text-zinc-400">Iniciá sesión para apostar en este mercado.</p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
        >
          Iniciar sesión
        </button>
      </div>
    )
  }

  const price = side === 'YES' ? market.yesPrice : 1 - market.yesPrice
  const numericAmount = Number(amount)
  const estimatedShares = numericAmount > 0 ? numericAmount / price : 0

  const handleBuy = () => {
    const result = buyShares(market, side, numericAmount)
    setFeedback(
      result.ok
        ? { ok: true, msg: `Compraste ${result.shares.toFixed(2)} shares de "${side === 'YES' ? 'Sí' : 'No'}".` }
        : { ok: false, msg: result.error },
    )
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide('YES')}
          className={`rounded-lg border py-2 text-sm font-semibold transition ${
            side === 'YES'
              ? 'border-emerald-400 bg-emerald-400/15 text-emerald-300'
              : 'border-zinc-800 text-zinc-400'
          }`}
        >
          Sí · {formatPercent(market.yesPrice)}
        </button>
        <button
          type="button"
          onClick={() => setSide('NO')}
          className={`rounded-lg border py-2 text-sm font-semibold transition ${
            side === 'NO'
              ? 'border-rose-400 bg-rose-400/15 text-rose-300'
              : 'border-zinc-800 text-zinc-400'
          }`}
        >
          No · {formatPercent(1 - market.yesPrice)}
        </button>
      </div>

      <label htmlFor="buy-amount" className="mb-1 block text-xs font-medium text-zinc-500">
        Monto (TCRED)
      </label>
      <input
        id="buy-amount"
        type="number"
        min="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="mb-3 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600"
      />

      <div className="mb-4 flex items-center justify-between text-xs text-zinc-500">
        <span>Shares estimadas</span>
        <span className="text-zinc-300">{estimatedShares.toFixed(2)}</span>
      </div>

      <button
        type="button"
        onClick={handleBuy}
        className="w-full rounded-lg bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
      >
        Comprar {side === 'YES' ? 'Sí' : 'No'}
      </button>

      {feedback && (
        <p className={`mt-3 text-xs ${feedback.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
          {feedback.msg}
        </p>
      )}

      <p className="mt-3 text-right text-xs text-zinc-600">Saldo disponible: {formatTCRED(balance)}</p>
    </div>
  )
}
