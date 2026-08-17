import { useEffect, useState } from 'react'
import { Shield, ShieldAlert, Check, Plus, Trash2 } from 'lucide-react'
import { listUserRoles, grantUserRole, revokeUserRole } from '../repositories/adminRepository.js'
import { toAppError } from '../lib/errors.js'

export default function AdminPanelPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [actionSuccess, setActionSuccess] = useState(null)
  const [pendingUserRole, setPendingUserRole] = useState(null)

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await listUserRoles()
      setUsers(data)
    } catch (err) {
      setError(toAppError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleToggleRole = async (userId, role, hasIt) => {
    setPendingUserRole(`${userId}-${role}`)
    setError(null)
    setActionSuccess(null)
    try {
      if (hasIt) {
        await revokeUserRole(userId, role)
        setActionSuccess(`Rol '${role}' revocado correctamente.`)
      } else {
        await grantUserRole(userId, role)
        setActionSuccess(`Rol '${role}' otorgado correctamente.`)
      }
      await loadData()
    } catch (err) {
      setError(toAppError(err))
    } finally {
      setPendingUserRole(null)
    }
  }

  if (loading) return <p className="text-sm text-zinc-400">Cargando panel de administración…</p>

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-400">
          <Shield size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Panel de Administración de Roles</h1>
          <p className="text-xs text-zinc-400">Gestión de permisos globales (Super Admin, Organizador, Árbitro).</p>
        </div>
      </div>

      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-300">
          <Check size={16} /> {actionSuccess}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-400">
          <ShieldAlert size={16} /> {error.message || 'Ocurrió un error al actualizar los roles.'}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 overflow-hidden">
        <table className="w-full text-left text-xs text-zinc-300">
          <thead className="bg-zinc-900/80 text-[11px] font-semibold uppercase text-zinc-400 border-b border-zinc-800">
            <tr>
              <th scope="col" className="px-4 py-3">Usuario / Email</th>
              <th scope="col" className="px-4 py-3">Roles Actuales</th>
              <th scope="col" className="px-4 py-3 text-right">Acciones de Rol</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-500">
                  No se encontraron usuarios registrados.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.user_id} className="hover:bg-zinc-900/40">
                  <td className="px-4 py-3">
                    <div className="font-bold text-zinc-100">{u.username || 'Sin username'}</div>
                    <div className="text-[11px] text-zinc-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {u.roles.length === 0 ? (
                        <span className="text-[10px] text-zinc-500 font-mono">user (default)</span>
                      ) : (
                        u.roles.map((r) => (
                          <span
                            key={r}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              r === 'admin'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : r === 'organizer'
                                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                                : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                            }`}
                          >
                            {r}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {['organizer', 'referee', 'admin'].map((role) => {
                        const hasIt = u.roles.includes(role)
                        const isPending = pendingUserRole === `${u.user_id}-${role}`
                        return (
                          <button
                            key={role}
                            type="button"
                            disabled={isPending}
                            onClick={() => handleToggleRole(u.user_id, role, hasIt)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition ${
                              hasIt
                                ? 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/30'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border border-zinc-700'
                            }`}
                          >
                            {hasIt ? <Trash2 size={10} /> : <Plus size={10} />}
                            {hasIt ? `Quitar ${role}` : `Dar ${role}`}
                          </button>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
