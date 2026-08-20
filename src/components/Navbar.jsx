import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Wallet, LogOut, Sparkles, PlusCircle, Menu, Search } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useDisconnect } from 'wagmi'
import { claimOrganizerRole } from '../repositories/tournamentRepository.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import Avatar from './Avatar.jsx'

export default function Navbar({ onToggleNav }) {
  const { status, profile, hasRole, signOut, refresh } = useSession()
  const navigate = useNavigate()
  const { disconnect } = useDisconnect()
  const [claiming, setClaiming] = useState(false)
  const [q, setQ] = useState('')
  const { t, lang, setLang } = useI18n()

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
    <header className="flex h-[60px] items-center justify-between gap-4 px-4 md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center border border-[#2a2a2a] text-[#8a8680] md:hidden"
          aria-label={t('nav.openMenu')}
          onClick={onToggleNav}
        >
          <Menu size={16} />
        </button>
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center bg-[#b6ff3a] font-display text-lg text-[#0a0c08]">
            C
          </span>
          <span className="leading-none">
            <span className="block font-display text-[26px] uppercase leading-none text-white">COLISEUM</span>
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-[#b6ff3a] sm:block">
              Líneas FGC
            </span>
          </span>
        </Link>
      </div>

      <form onSubmit={submitSearch} className="hidden max-w-md flex-1 md:flex">
        <label className="flex w-full items-center gap-2 border-b border-[#2a2a2a] px-1">
          <Search size={14} className="text-[#6f6b64]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('nav.search')}
            aria-label={t('nav.search')}
            className="h-8 w-full bg-transparent text-[13px] text-[#efece6] outline-none placeholder:text-[#5a5650]"
          />
        </label>
      </form>

      <div className="flex items-center gap-2">
        {FEATURE_FLAGS.web3 && (
          <Link
            to="/mercados/nuevo"
            className="hidden items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#8a8680] hover:text-[#c6a46a] sm:inline-flex"
          >
            <PlusCircle size={12} />
            {t('nav.createMarket')}
          </Link>
        )}

        {isAuthenticated && (
          <Link
            to="/apuestas"
            className="hidden px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#8a8680] hover:text-[#eef1f4] sm:inline-flex"
          >
            {t('nav.bets')}
          </Link>
        )}

        {isAuthenticated && !isOrganizerOrAdmin && (
          <button
            type="button"
            onClick={handleClaimOrganizer}
            disabled={claiming}
            aria-busy={claiming}
            className="hidden items-center gap-1 border border-[#2a3140] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#b6ff3a] hover:bg-[#b6ff3a] hover:text-[#0a0c08] disabled:opacity-50 lg:inline-flex"
            title="Obtener rol de organizador para administrar torneos"
          >
            <Sparkles size={12} />
            {claiming ? t('nav.activating') : t('nav.becomeOrganizer')}
          </button>
        )}

        {isAuthenticated ? (
          <>
            <Link
              to="/wallet"
              className="inline-flex items-center gap-1.5 border border-[#2a3140] px-3 py-1.5 text-[12px] font-semibold text-[#eef1f4] hover:border-[#b6ff3a]"
            >
              <Wallet size={13} />
              <span>{t('nav.wallet')}</span>
            </Link>
            <Link to={`/jugadores/${profile.username}`} className="flex items-center gap-1.5 px-1">
              <Avatar username={profile.username} size={24} />
              <span className="hidden text-[12px] font-medium text-[#efece6] sm:inline">@{profile.username}</span>
            </Link>
            <button
              type="button"
              onClick={async () => {
                await signOut()
                try {
                  disconnect()
                } catch {
                  // already disconnected
                }
                navigate('/', { replace: true })
              }}
              title={t('nav.signOut')}
              aria-label={t('nav.signOut')}
              className="p-1.5 text-[#6f6b64] hover:text-[#efece6]"
            >
              <LogOut size={15} />
            </button>
          </>
        ) : (
          <Link to="/login" className="btn-lime px-4 py-2 text-[12px]">
            {t('nav.signIn')}
          </Link>
        )}
        <div className="ml-1 flex items-center text-[10px] font-bold uppercase tracking-wider" title={t('nav.language')}>
          <button
            type="button"
            onClick={() => setLang('es')}
            className={lang === 'es' ? 'text-lime' : 'text-[#6f6b64] hover:text-[#efece6]'}
          >
            ES
          </button>
          <span className="px-1 text-[#3a3a3a]">|</span>
          <button
            type="button"
            onClick={() => setLang('en')}
            className={lang === 'en' ? 'text-lime' : 'text-[#6f6b64] hover:text-[#efece6]'}
          >
            EN
          </button>
        </div>
      </div>
    </header>
  )
}
