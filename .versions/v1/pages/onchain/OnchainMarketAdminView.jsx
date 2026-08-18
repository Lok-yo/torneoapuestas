// Read-only view over on-chain markets, replacing
// PredictionMarketAdminPanel's create/resolve admin flow when
// FEATURE_FLAGS.web3 is on — permissionless creation means there is no
// admin approval gate anymore (proposal.md "market creation:
// permissionless", a deliberate departure from the admin-only posture).
// Resolution similarly happens on-chain via the relayer + multisig, not
// an admin button. See tasks.md 12.2 and design.md Decision 7.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, ExternalLink, PlusCircle } from 'lucide-react'
import { listOnchainMarkets } from '../../repositories/onchainMarketRepository.js'
import { toAppError } from '../../lib/errors.js'

export default function OnchainMarketAdminView() {
  const [markets, setMarkets] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    listOnchainMarkets()
      .then(setMarkets)
      .catch((err) => setError(toAppError(err)))
  }, [])

  if (error) {
    return (
      <p role="alert" className="text-sm text-rose-400">
        No pudimos cargar los mercados on-chain ahora mismo.
      </p>
    )
  }

  return (
    <section className="mt-4 flex flex-col gap-4 rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-950/30 via-zinc-900/60 to-zinc-950 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-violet-400" size={18} />
          <h2 className="text-sm font-bold text-zinc-50">Mercados on-chain (permisionless)</h2>
        </div>
        <Link
          to="/mercados/nuevo"
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
        >
          <PlusCircle size={14} /> Crear mercado
        </Link>
      </div>
      <p className="text-xs text-zinc-500">
        Cualquier wallet puede crear un mercado sobre un evento de start.gg ya ingerido, sujeto al bono de creación
        anti-spam. No hay aprobación de administrador — este panel es de solo lectura.
      </p>

      {markets.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">Todavía no hay mercados on-chain creados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900/80 text-left uppercase tracking-wide text-zinc-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Question ID</th>
                <th scope="col" className="px-3 py-2 font-medium">Evento start.gg</th>
                <th scope="col" className="px-3 py-2 font-medium">Estado</th>
                <th scope="col" className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {markets.map((m) => (
                <tr key={m.condition_id} className="hover:bg-zinc-900/30">
                  <td className="px-3 py-2 font-mono text-zinc-400">{m.question_id?.slice(0, 12)}…</td>
                  <td className="px-3 py-2 text-zinc-300">{m.startgg_event_id}</td>
                  <td className="px-3 py-2 text-zinc-300">{m.state}</td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      to={`/mercados/${m.question_id}`}
                      className="inline-flex items-center gap-1 text-violet-400 hover:underline"
                    >
                      Ver <ExternalLink size={12} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
