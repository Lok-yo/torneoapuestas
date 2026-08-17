import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Trophy, Wallet, LogOut, Sparkles } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { claimOrganizerRole } from '../repositories/tournamentRepository.js'
import Avatar from './Avatar.jsx'

const NAV_LINKS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/torneos', label: 'Torneos' },
  { to: '/ranking', label: 'Ranking' },
]

export default function Navbar() {
  const { status, profile, hasRole, signOut, refresh } = useSession()
  const navigate = useNavigate()
  const [claiming, setClaiming] = useState(false)

  const isAuthenticated = status === 'authenticated' && Boolean(profile?.username)
  const isOrganizerOrAdmin = hasRole('organizer') || hasRole('admin')

  const handleClaimOrganizer = async () => {
    setClaiming(true)
    try {
      await claimOrganizerRole()
      await refresh()
      navigate('/organizador')
    } catch (err) {
      console.error('Error al solicitar rol de organizador:', err)
    } finally {
      setClaiming(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-lg shadow-violet-500/20 group-hover:scale-105 transition-transform">
              <Trophy size={18} />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-zinc-50 tracking-tight leading-none group-hover:text-violet-300 transition-colors">
                TorneoApuestas
              </span>
              <span className="text-[10px] font-medium text-violet-400 leading-tight">Fighting Games & Markets</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1.5 text-xs font-semibold text-zinc-400 sm:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-xl transition ${
                    isActive
                      ? 'bg-zinc-800/80 text-zinc-50 shadow-inner'
                      : 'hover:bg-zinc-900 hover:text-zinc-200'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}

            {isAuthenticated && (
              isOrganizerOrAdmin ? (
                <>
                  <NavLink
                    to="/organizador"
                    className={({ isActive }) =>
                      `px-3 py-1.5 rounded-xl transition ${
                        isActive
                          ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                          : 'hover:bg-zinc-900 hover:text-zinc-200'
                      }`
                    }
                  >
                    Panel organizador
                  </NavLink>
                  {hasRole('admin') && (
                    <NavLink
                      to="/admin"
                      className={({ isActive }) =>
                        `px-3 py-1.5 rounded-xl transition ${
                          isActive
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'text-amber-400/90 hover:bg-amber-500/10 hover:text-amber-300'
                        }`
                      }
                    >
                      Admin
                    </NavLink>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleClaimOrganizer}
                  disabled={claiming}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 disabled:opacity-50 transition"
                  title="Obtener rol de organizador para crear torneos"
                >
                  <Sparkles size={12} />
                  {claiming ? 'Activando…' : 'Ser Organizador'}
                </button>
              )
            )}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <>
              <Link
                to="/wallet"
                className="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:border-violet-500/40 hover:bg-zinc-900 transition shadow-sm"
              >
                <Wallet size={14} className="text-emerald-400" />
                <span>Billetera</span>
              </Link>
              <Link
                to={`/jugadores/${profile.username}`}
                className="flex items-center gap-2 rounded-xl p-1 hover:bg-zinc-900 transition"
              >
                <Avatar username={profile.username} size={28} />
                <span className="hidden text-xs font-semibold text-zinc-200 sm:inline">
                  @{profile.username}
                </span>
              </Link>
              <button
                type="button"
                onClick={signOut}
                title="Cerrar sesión"
                className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-bold !text-white shadow-md shadow-violet-500/20 hover:from-violet-500 hover:to-indigo-500 transition"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
