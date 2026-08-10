import { useSessionStore } from '../store/useSessionStore.js'
import { useWalletStore } from '../store/useWalletStore.js'
import PositionRow from '../components/PositionRow.jsx'
import { formatTCRED, formatDateTime } from '../lib/format.js'

export default function WalletPage() {
  const user = useSessionStore((s) => s.user)
  const balance = useWalletStore((s) => s.balance)
  const positions = useWalletStore((s) => s.positions)
  const transactions = useWalletStore((s) => s.transactions)

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Billetera de @{user.username}</h1>
        <p className="text-sm text-zinc-400">
          Créditos simulados (TCRED) — sin valor real, solo para probar la plataforma.
        </p>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-zinc-800 bg-gradient-to-br from-violet-500/10 to-zinc-900 p-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs text-zinc-500">Saldo disponible</p>
          <p className="text-3xl font-bold text-zinc-50">{formatTCRED(balance)}</p>
        </div>
        <button
          type="button"
          disabled
          title="Próximamente: depósito con criptomonedas reales"
          className="cursor-not-allowed rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-500"
        >
          Depositar cripto (próximamente)
        </button>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Posiciones abiertas
        </h2>
        {positions.length === 0 ? (
          <p className="text-sm text-zinc-500">No tenés posiciones abiertas todavía.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {positions.map((p) => (
              <PositionRow key={`${p.marketId}-${p.side}`} position={p} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Historial</h2>
        {transactions.length === 0 ? (
          <p className="text-sm text-zinc-500">Todavía no hiciste ninguna operación.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Lado</th>
                  <th className="px-4 py-2 text-right font-medium">Monto</th>
                  <th className="px-4 py-2 text-right font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="px-4 py-2 text-zinc-300">{tx.type === 'buy' ? 'Compra' : 'Venta'}</td>
                    <td className="px-4 py-2 text-zinc-400">{tx.side === 'YES' ? 'Sí' : 'No'}</td>
                    <td className="px-4 py-2 text-right text-zinc-200">{formatTCRED(tx.amount)}</td>
                    <td className="px-4 py-2 text-right text-zinc-500">
                      {formatDateTime(tx.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
