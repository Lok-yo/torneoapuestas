import { useEffect, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, MinusCircle, RefreshCw, AlertCircle } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { getWallet, withdrawFunds, getTransactionHistory } from '../repositories/walletRepository.js'
import { formatDateTime } from '../lib/format.js'
import { toAppError } from '../lib/errors.js'

export default function WalletPage() {
  return <LegacyWalletPage />
}

// Diálogo accesible: foco inicial, trap de Tab/Shift+Tab, cierre con
// Escape y clic en el backdrop (no dentro del panel). role="dialog" +
// aria-modal solo anuncian la semántica; el manejo de foco es lo que
// hace al modal realmente operable por teclado/lector de pantalla.
function ModalDialog({ labelledBy, onClose, children }) {
  const dialogRef = useRef(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined
    const focusables = dialog.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    const restoreTo = document.activeElement
    ;(focusables[0] ?? dialog).focus()

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = Array.from(
        dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.disabled)
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      if (restoreTo instanceof HTMLElement) restoreTo.focus()
    }
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {children}
    </div>
  )
}

function LegacyWalletPage() {
  const { profile } = useSession()
  const [walletState, setWalletState] = useState({ status: 'loading', wallet: null, transactions: [], error: null })
  const [withdrawAmount, setWithdrawAmount] = useState('20')
  const [actionError, setActionError] = useState(null)
  const [actionPending, setActionPending] = useState(false)
  const [activeModal, setActiveModal] = useState(null) // 'withdraw' | null

  const loadData = async () => {
    setWalletState((prev) => ({ ...prev, status: 'loading', error: null }))
    try {
      const [wallet, transactions] = await Promise.all([getWallet(), getTransactionHistory()])
      setWalletState({ status: 'ready', wallet, transactions, error: null })
    } catch (err) {
      setWalletState({ status: 'error', wallet: null, transactions: [], error: toAppError(err) })
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleWithdraw = async (e) => {
    e.preventDefault()
    const num = parseFloat(withdrawAmount)
    if (isNaN(num) || num <= 0) {
      setActionError('Ingresá un monto válido para retirar.')
      return
    }
    setActionPending(true)
    setActionError(null)
    try {
      await withdrawFunds(num, 'Retiro a cuenta bancaria / crypto')
      setActiveModal(null)
      await loadData()
    } catch (err) {
      setActionError(toAppError(err).message)
    } finally {
      setActionPending(false)
    }
  }

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: walletState.wallet?.currency || 'USD',
    }).format(val ?? 0)
  }

  const getTypeBadge = (type) => {
    switch (type) {
      case 'INITIAL_BONUS':
        return <span className="rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-300">Bono Inicial</span>
      case 'DEPOSIT':
        return <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">Depósito</span>
      case 'WITHDRAWAL':
        return <span className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-medium text-rose-300">Retiro</span>
      case 'BET_PLACED':
        return <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">Apuesta</span>
      case 'BET_PAYOUT':
        return <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">Premio</span>
      default:
        return <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300">{type}</span>
    }
  }

  if (walletState.status === 'loading') {
    return <p className="py-12 text-center text-sm text-zinc-500">Cargando billetera…</p>
  }

  if (walletState.status === 'error') {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-rose-800/50 bg-rose-950/20 p-6 text-center">
        <AlertCircle size={32} className="mx-auto mb-2 text-rose-400" />
        <p className="text-sm text-rose-300">No pudimos cargar tu billetera.</p>
        <p className="mt-1 text-xs text-zinc-400">{walletState.error?.message}</p>
        <button
          type="button"
          onClick={loadData}
          className="mt-4 rounded-lg bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-700"
        >
          Reintentar
        </button>
      </div>
    )
  }

  const { wallet, transactions } = walletState

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">Caja</p>
          <h1 className="mt-1 font-display text-4xl font-bold text-white">Billetera de @{profile?.username}</h1>
          <p className="text-sm text-zinc-400">
            Libro contable y saldo auditable en tiempo real para predicciones y torneos.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-700"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col justify-between border border-zinc-800 bg-zinc-950 p-6 sm:col-span-2">
          <div>
            <span className="text-xs uppercase tracking-wider text-zinc-400">Saldo Total</span>
            <p className="mt-1 font-mono text-4xl font-bold text-zinc-50">{formatCurrency(wallet.balance)}</p>
          </div>
          <div className="mt-6 flex flex-wrap gap-4 border-t border-zinc-800/80 pt-4 text-sm">
            <div>
              <span className="text-xs text-zinc-500">Disponible para apostar/retirar</span>
              <p className="font-mono font-medium text-emerald-400">{formatCurrency(wallet.available_balance)}</p>
            </div>
            <div>
              <span className="text-xs text-zinc-500">Bloqueado en apuestas</span>
              <p className="font-mono font-medium text-amber-400">{formatCurrency(wallet.locked_balance)}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center gap-3 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Treasury desk</p>
          <button
            type="button"
            onClick={() => {
              setActionError(null)
              setActiveModal('withdraw')
            }}
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-950 py-3 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
          >
            <MinusCircle size={18} /> Retirar Fondos
          </button>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Historial de Movimientos (Ledger)
        </h2>
        {transactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">Todavía no registrás operaciones en tu billetera.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Fecha</th>
                  <th scope="col" className="px-4 py-3 font-medium">Tipo</th>
                  <th scope="col" className="px-4 py-3 font-medium">Descripción</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Monto</th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-zinc-900/30">
                    <td className="px-4 py-3 text-xs text-zinc-400">{formatDateTime(tx.created_at)}</td>
                    <td className="px-4 py-3">{getTypeBadge(tx.type)}</td>
                    <td className="px-4 py-3 text-zinc-300">{tx.description}</td>
                    <td className={`px-4 py-3 text-right font-medium ${tx.amount >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <span className="flex items-center justify-end gap-1 font-mono">
                        {tx.amount >= 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
                        {formatCurrency(tx.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">{tx.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {activeModal === 'withdraw' && (
        <ModalDialog labelledBy="withdraw-modal-title" onClose={() => setActiveModal(null)}>
          <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6">
            <h3 id="withdraw-modal-title" className="text-lg font-bold text-zinc-50">Retirar Saldo</h3>
            <p className="mt-1 text-xs text-zinc-400">
              Saldo disponible actual: <strong className="text-emerald-400">{formatCurrency(wallet.available_balance)}</strong>
            </p>

            <form onSubmit={handleWithdraw} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="withdraw-amount-input" className="mb-1 block text-xs font-medium text-zinc-400">
                  Monto a retirar (USD)
                </label>
                <input
                  id="withdraw-amount-input"
                  type="number"
                  step="0.01"
                  min="1"
                  max={wallet.available_balance}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-violet-500"
                />
              </div>

              {actionError && <p className="text-xs text-rose-400">{actionError}</p>}

              <div className="mt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="flex-1 rounded-xl border border-zinc-800 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-900"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionPending}
                  className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {actionPending ? 'Procesando…' : 'Solicitar Retiro'}
                </button>
              </div>
            </form>
          </div>
        </ModalDialog>
      )}
    </div>
  )
}
