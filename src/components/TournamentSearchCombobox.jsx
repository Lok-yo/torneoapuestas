import { useState, useEffect, useRef } from 'react'
import { Search, Loader2, X } from 'lucide-react'
import { searchTournaments } from '../repositories/tournamentRepository.js'

export default function TournamentSearchCombobox({ onSelect, disabled }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setOpen(false)
      return
    }

    setLoading(true)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchTournaments(query)
        setResults(data)
        setOpen(data.length > 0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(debounceRef.current)
  }, [query])

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleSelect(tournament) {
    onSelect(tournament)
    setQuery(tournament.name)
    setOpen(false)
  }

  function handleClear() {
    setQuery('')
    setResults([])
    setOpen(false)
    onSelect(null)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          id="tournament-search"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          disabled={disabled}
          placeholder="Buscar torneo por nombre o juego..."
          aria-label="Buscar torneo"
          aria-expanded={open}
          aria-controls="tournament-search-listbox"
          aria-autocomplete="list"
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
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl"
        >
          {results.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => handleSelect(t)}
                className="flex w-full flex-col gap-0.5 px-4 py-3 text-left text-sm text-zinc-200 hover:bg-zinc-800/60 focus:bg-zinc-800/60 focus:outline-none"
              >
                <span className="font-medium text-zinc-100">{t.name}</span>
                <span className="text-xs text-zinc-500">
                  {t.game_id.toUpperCase()} · Evento #{t.startgg_event_id}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
