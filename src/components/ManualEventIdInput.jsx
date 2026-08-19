import { ExternalLink } from 'lucide-react'

export default function ManualEventIdInput({ value, onChange, onClear, disabled }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <input
          id="manual-event-id"
          type="number"
          min="1"
          step="1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Ej. 1234567"
          aria-label="ID del evento en start.gg"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-violet-500 disabled:opacity-50 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
            aria-label="Limpiar ID"
          >
            Limpiar
          </button>
        )}
      </div>
      <a
        href="https://www.start.gg/events"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300"
      >
        <ExternalLink size={12} />
        Buscar evento en start.gg
      </a>
    </div>
  )
}
