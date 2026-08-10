import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '../store/useSessionStore.js'

export default function OnboardingUsernamePage() {
  const navigate = useNavigate()
  const user = useSessionStore((s) => s.user)
  const setUsername = useSessionStore((s) => s.setUsername)
  const isUsernameTaken = useSessionStore((s) => s.isUsernameTaken)
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
    else if (user.username) navigate('/', { replace: true })
  }, [user, navigate])

  const handleSubmit = (e) => {
    e.preventDefault()
    const clean = value.trim()
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(clean)) {
      setError('Entre 3 y 20 caracteres: letras, números y guión bajo.')
      return
    }
    if (isUsernameTaken(clean)) {
      setError('Ese usuario ya está en uso.')
      return
    }
    setUsername(clean)
    navigate('/')
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Elegí tu usuario</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Así te van a ver otros jugadores en torneos y mercados.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-950 px-3">
          <span className="text-zinc-500">@</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            placeholder="tu_usuario"
            className="w-full bg-transparent px-2 py-2.5 text-sm text-zinc-100 outline-none"
          />
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <button
          type="submit"
          className="rounded-lg bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white"
        >
          Continuar
        </button>
      </form>
    </div>
  )
}
