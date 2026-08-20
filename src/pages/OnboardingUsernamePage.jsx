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
    <div className="mx-auto mt-12 flex max-w-sm flex-col gap-6 border border-[#242424] bg-[#0c0c0c] p-8">
      <div>
        <p className="kicker">Cuenta</p>
        <h1 className="mt-1 font-display text-4xl font-bold text-white">Elige tu usuario</h1>
        <p className="mt-1 text-sm text-[#8a8680]">Así te van a ver otros jugadores en torneos y en el ranking.</p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center border border-[#242424] bg-[#050505] px-3">
          <span className="text-[#6f6b64]">@</span>
          <input
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setError(null)
            }}
            placeholder="tu_usuario"
            className="w-full bg-transparent px-2 py-2.5 text-sm text-[#edeae3] outline-none"
          />
        </div>
        {error && <p className="text-xs text-[#b11226]">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="btn-lime py-2.5 disabled:opacity-60"
        >
          {pending ? 'Guardando…' : 'Continuar'}
        </button>
      </form>
    </div>
  )
}
