import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider.jsx'
import { claimUsername } from '../repositories/profileRepository.js'
import { toAppError } from '../lib/errors.js'

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/

export default function OnboardingUsernamePage() {
  const navigate = useNavigate()
  const { status, profile, refresh } = useSession()
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (status === 'anonymous' || status === 'expired') navigate('/login', { replace: true })
    else if (status === 'authenticated' && profile?.username) navigate('/', { replace: true })
  }, [status, profile, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    const clean = value.trim()
    if (!USERNAME_PATTERN.test(clean)) {
      setError('Entre 3 y 20 caracteres: letras, números y guión bajo.')
      return
    }

    setPending(true)
    setError(null)
    try {
      const requestId = crypto.randomUUID()
      const result = await claimUsername(requestId, clean)

      if (result.status === 'claimed') {
        await refresh()
        navigate('/')
        return
      }
      if (result.status === 'conflict') {
        setError('Ese usuario ya está en uso.')
        return
      }
      setError('Hiciste demasiados intentos. Esperá unos minutos y volvé a intentar.')
    } catch (rawError) {
      setError(toAppError(rawError).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Elegí tu usuario</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Así te van a ver otros jugadores en torneos y en el ranking.
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
          disabled={pending}
          className="rounded-lg bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
        >
          {pending ? 'Guardando…' : 'Continuar'}
        </button>
      </form>
    </div>
  )
}
