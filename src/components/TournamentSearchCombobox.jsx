import { useState, useEffect, useRef } from 'react'
import { Search, SearchX, Loader2, X } from 'lucide-react'
import { searchTournaments } from '../repositories/tournamentRepository.js'

export default function TournamentSearchCombobox({ onSelect, disabled }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [emptyQuery, setEmptyQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapperRef = useRef(null)
  const debounceRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setOpen(false)
      setActiveIndex(-1)
      return
    }

    let cancelled = false
    setLoading(true)
    setEmptyQuery('')
    setActiveIndex(-1)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchTournaments(query)
        if (cancelled) return
        setResults(data)
        if (data.length > 0) {
          setOpen(true)
        } else {
          setOpen(false)
          setEmptyQuery(query)
        }
      } catch {
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const items = listRef.current.querySelectorAll('[role="option"]')
    items[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function handleSelect(tournament) {
    onSelect(tournament)
    setQuery(tournament.name)
    setOpen(false)
    setActiveIndex(-1)
  }

  function handleClear() {
    setQuery('')
    setResults([])
    setOpen(false)
    setEmptyQuery('')
    setActiveIndex(-1)
    onSelect(null)
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') setOpen(false)
      return
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % results.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < results.length) {
          handleSelect(results[activeIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setOpen(false)
        setActiveIndex(-1)
        break
      default:
        break
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          id="tournament-search"
          type="text"
          role="combobox"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          placeholder="Buscar torneo por nombre o juego..."
          aria-label="Buscar torneo"
          aria-expanded={open}
          aria-controls="tournament-search-listbox"
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `tournament-option-${activeIndex}` : undefined}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 py-2.5 pl-10 pr-9 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500 disabled:opacity-50"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            aria-label="Limpiar búsqueda"
          >
            <X size={16} />
          </button>
        )}
        {loading && (
          <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-violet-400" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          id="tournament-search-listbox"
          ref={listRef}
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
        >
          {results.map((t, i) => (
            <li key={t.id}>
              <button
                type="button"
                id={`tournament-option-${i}`}
                role="option"
                aria-selected={activeIndex === i}
                onClick={() => handleSelect(t)}
                className={`flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm text-zinc-200 focus:outline-none ${
                  activeIndex === i ? 'bg-zinc-800/60' : 'hover:bg-zinc-800/60'
                }`}
              >
                <span className="font-medium text-zinc-100">{t.name}</span>
                <span className="text-xs text-zinc-500">
                  {t.game_id?.toUpperCase() ?? '—'} · Evento #{t.startgg_event_id}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!loading && emptyQuery && results.length === 0 && (
        <div className="absolute z-20 mt-1 flex w-full flex-col items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-6 shadow-xl">
          <SearchX size={20} className="text-zinc-500" />
          <p className="text-center text-xs text-zinc-400">
            No se encontraron torneos — probá otro nombre o usá ID manual
          </p>
        </div>
      )}
    </div>
  )
}
