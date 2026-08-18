import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wallet, LogOut, Sparkles, PlusCircle, Menu, Search } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { claimOrganizerRole } from '../repositories/tournamentRepository.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import Avatar from './Avatar.jsx'

export default function Navbar({ onToggleNav }) {
  const { status, profile, hasRole, signOut, refresh } = useSession()
  const navigate = useNavigate()
  const [claiming, setClaiming] = useState(false)
  const [q, setQ] = useState('')

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

  const submitSearch = (e) => {
    e.preventDefault()
    const term = q.trim()
    if (!term) {
      navigate('/torneos')
      return
    }
    navigate(`/torneos?q=${encodeURIComponent(term)}`)
  }

  return (
    <header className="flex h-[52px] items-center justify-between gap-3 px-3">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center border border-[#2a382c] text-[#b8b09a] md:hidden"
          aria-label="Abrir menú"
          onClick={onToggleNav}
        >
          <Menu size={16} />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center bg-[#c9a227] font-display text-sm font-extrabold text-[#141208]">
            C
          </span>
          <span className="leading-none">
            <span className="block font-display text-[15px] font-extrabold tracking-[0.12em] text-[#f0e6c8]">
              COLISEUM
            </span>
            <span className="hidden text-[10px] uppercase tracking-[0.16em] text-[#7d8574] sm:block">
              Casa FGC
            </span>
          </span>
        </Link>
      </div>

      <form onSubmit={submitSearch} className="hidden max-w-md flex-1 md:flex">
        <label className="flex w-full items-center gap-2 border border-[#2a382c] bg-[#0a120e] px-2">
          <Search size={14} className="text-[#6d7566]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar evento, juego, jugador…"
            className="h-8 w-full bg-transparent text-[13px] text-[#ddd6c4] outline-none placeholder:text-[#5c6458]"
          />
        </label>
      </form>

      <div className="flex items-center gap-1.5">
        {FEATURE_FLAGS.web3 && (
          <Link
            to="/mercados/nuevo"
            className="hidden items-center gap-1 border border-[#3a4a30] px-2 py-1 text-[11px] font-semibold text-[#c9a227] hover:bg-[#1a2418] sm:inline-flex"
          >
            <PlusCircle size={12} />
            Crear Mercado
          </Link>
        )}

        {isAuthenticated && !isOrganizerOrAdmin && (
          <button
            type="button"
            onClick={handleClaimOrganizer}
            disabled={claiming}
            aria-busy={claiming}
            className="hidden items-center gap-1 border border-[#3a4a30] px-2 py-1 text-[11px] font-semibold text-[#c9a227] hover:bg-[#1a2418] disabled:opacity-50 lg:inline-flex"
            title="Obtener rol de organizador para administrar torneos"
          >
            <Sparkles size={12} />
            {claiming ? 'Activando…' : 'Ser Organizador'}
          </button>
        )}

        {isAuthenticated ? (
          <>
            <Link
              to="/wallet"
              className="inline-flex items-center gap-1.5 border border-[#3a4a30] bg-[#141c12] px-2.5 py-1 text-[12px] font-semibold text-[#d8c37a]"
            >
              <Wallet size={13} />
              <span>Billetera</span>
            </Link>
            <Link to={`/jugadores/${profile.username}`} className="flex items-center gap-1.5 px-1">
              <Avatar username={profile.username} size={24} />
              <span className="hidden text-[12px] font-semibold text-[#ddd6c4] sm:inline">@{profile.username}</span>
            </Link>
            <button
              type="button"
              onClick={signOut}
              title="Cerrar sesión"
              aria-label="Cerrar sesión"
              className="p-1.5 text-[#8a9080] hover:text-[#ddd6c4]"
            >
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <Link to="/login" className="bg-[#c9a227] px-3 py-1.5 text-[12px] font-bold text-[#141208] hover:bg-[#ddb83a]">
            Ingresar
          </Link>
        )}
      </div>
    </header>
  )
}
