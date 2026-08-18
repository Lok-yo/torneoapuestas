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
      <div className="bento p-5 text-sm text-zinc-400">
        Este mercado ya está resuelto — el resultado fue{' '}
        <strong className="text-zinc-200">{market.resolvedSide === 'YES' ? 'Sí' : 'No'}</strong>.
      </div>
    )
  }

  if (!user?.username) {
    return (
      <div className="bento p-5 text-center">
        <p className="mb-3 text-sm text-zinc-400">Iniciá sesión para apostar en este mercado.</p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-violet-500/20 hover:from-violet-500 hover:to-indigo-400"
        >
          Iniciar sesión
        </button>
      </div>
    )
  }

  const price = side === 'YES' ? market.yesPrice : 1 - market.yesPrice
  const numericAmount = Number(amount)
  const estimatedShares = numericAmount > 0 ? numericAmount / price : 0
  const estimatedReturn = estimatedShares
  const feeHint = numericAmount > 0 ? Math.max(0.01, numericAmount * 0.01) : 0

  const handleBuy = () => {
    const result = buyShares(market, side, numericAmount)
    setFeedback(
      result.ok
        ? { ok: true, msg: `Compraste ${result.shares.toFixed(2)} shares de "${side === 'YES' ? 'Sí' : 'No'}".` }
        : { ok: false, msg: result.error },
    )
  }

  const applyPct = (pct) => {
    const next = Math.max(1, Math.floor((Number(balance) || 0) * pct))
    setAmount(next)
  }

  return (
    <div className="rounded-2xl border border-violet-500/25 bg-gradient-to-b from-violet-950/40 via-[#0d0f17]/80 to-[#0d0f17] p-5 shadow-xl backdrop-blur-md">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-300">Fast Swap</p>
        <p className="font-mono text-[10px] text-zinc-500">liq. {formatPercent(price)}</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setSide('YES')}
          className={`rounded-xl border py-2.5 text-sm font-bold transition ${
            side === 'YES'
              ? 'border-emerald-400/70 bg-emerald-400/15 text-emerald-300 shadow-[0_0_24px_-10px_rgba(16,185,129,0.9)]'
              : 'border-zinc-800 text-zinc-400 hover:border-emerald-500/30'
          }`}
        >
          SÍ · {formatPercent(market.yesPrice)}
        </button>
        <button
          type="button"
          onClick={() => setSide('NO')}
          className={`rounded-xl border py-2.5 text-sm font-bold transition ${
            side === 'NO'
              ? 'border-rose-400/70 bg-rose-400/15 text-rose-300 shadow-[0_0_24px_-10px_rgba(244,63,94,0.9)]'
              : 'border-zinc-800 text-zinc-400 hover:border-rose-500/30'
          }`}
        >
          NO · {formatPercent(1 - market.yesPrice)}
        </button>
      </div>

      <label htmlFor="buy-amount" className="mb-1 block text-[11px] font-medium text-zinc-500">
        Monto (TCRED)
      </label>
      <div className="relative mb-2">
        <input
          id="buy-amount"
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-zinc-100 outline-none focus:border-violet-500"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-zinc-600">
          TCRED
        </span>
      </div>

      <div className="mb-4 flex gap-1.5">
        {[0.25, 0.5, 1].map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => applyPct(pct)}
            className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/70 py-1 font-mono text-[10px] font-semibold text-zinc-400 hover:border-violet-500/40 hover:text-violet-200"
          >
            {pct === 1 ? 'MAX' : `${pct * 100}%`}
          </button>
        ))}
      </div>

      <div className="mb-4 space-y-1.5 rounded-xl border border-white/5 bg-black/30 p-3 font-mono text-[11px]">
        <div className="flex items-center justify-between text-zinc-500">
          <span>Shares estimadas</span>
          <span className="text-zinc-200">{estimatedShares.toFixed(2)}</span>
        </div>
        <div className="flex items-center justify-between text-zinc-500">
          <span>Retorno si gana</span>
          <span className="text-emerald-400">{estimatedReturn.toFixed(2)} TCRED</span>
        </div>
        <div className="flex items-center justify-between text-zinc-500">
          <span>Tarifa / liquidez</span>
          <span className="text-zinc-400">~{feeHint.toFixed(2)}</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleBuy}
        className={`w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-lg transition ${
          side === 'YES'
            ? 'bg-gradient-to-r from-emerald-600 to-teal-500 shadow-emerald-500/20 hover:from-emerald-500'
            : 'bg-gradient-to-r from-rose-600 to-pink-500 shadow-rose-500/20 hover:from-rose-500'
        }`}
      >
        Comprar {side === 'YES' ? 'SÍ' : 'NO'}
      </button>

      {feedback && (
        <p className={`mt-3 text-xs ${feedback.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{feedback.msg}</p>
      )}

      <p className="mt-3 text-right font-mono text-[11px] text-zinc-600">Saldo disponible: {formatTCRED(balance)}</p>
    </div>
  )
}
