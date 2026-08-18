import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="kicker">Sin ruta</p>
      <h1 className="mt-2 font-display text-6xl font-bold text-white">404</h1>
      <p className="text-[#8a8680]">No encontramos esta página.</p>
      <Link to="/" className="btn-ghost mt-3 px-4 py-2">
        Volver al inicio
      </Link>
    </div>
  )
}
