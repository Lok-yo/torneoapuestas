import { Link, NavLink } from 'react-router-dom'
import { Trophy, Wallet, LogOut } from 'lucide-react'
import { useSessionStore } from '../store/useSessionStore.js'
import { useWalletStore } from '../store/useWalletStore.js'
import { formatTCRED } from '../lib/format.js'
import Avatar from './Avatar.jsx'

const NAV_LINKS = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/torneos', label: 'Torneos' },
  { to: '/ranking', label: 'Ranking' },
]

export default function Navbar() {
  const user = useSessionStore((s) => s.user)
  const logout = useSessionStore((s) => s.logout)
  const balance = useWalletStore((s) => s.balance)

  return (
    <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-bold text-zinc-50">
            <Trophy size={20} className="text-violet-400" />
            TorneoApuestas
          </Link>
          <nav className="hidden items-center gap-4 text-sm font-medium text-zinc-400 sm:flex">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => (isActive ? 'text-zinc-50' : 'hover:text-zinc-200')}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user?.username ? (
            <>
              <Link
                to="/wallet"
                className="flex items-center gap-1.5 rounded-full border border-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-200 hover:border-zinc-700"
              >
                <Wallet size={14} />
                {formatTCRED(balance)}
              </Link>
              <Link to={`/jugadores/${user.username}`} className="flex items-center gap-2">
                <Avatar username={user.username} size={30} />
                <span className="hidden text-sm font-medium text-zinc-200 sm:inline">
                  @{user.username}
                </span>
              </Link>
              <button
                type="button"
                onClick={logout}
                title="Cerrar sesión"
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              >
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-white"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
