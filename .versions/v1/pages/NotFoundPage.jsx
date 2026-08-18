import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="font-mono text-xs tracking-[0.3em] text-[#c9a227]">MESA CERRADA</p>
      <h1 className="font-display text-5xl font-extrabold text-[#f0e6c8]">404</h1>
      <p className="text-[#8a9080]">No encontramos esta página.</p>
      <Link
        to="/"
        className="mt-2 border border-[#3a4a30] px-4 py-2 text-sm text-[#c9a227] hover:bg-[#162016]"
      >
        Volver al inicio
      </Link>
    </div>
  )
}
