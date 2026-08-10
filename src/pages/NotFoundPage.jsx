import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <h1 className="text-3xl font-bold text-zinc-50">404</h1>
      <p className="text-zinc-400">No encontramos esta página.</p>
      <Link to="/" className="text-sm text-violet-400 hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
