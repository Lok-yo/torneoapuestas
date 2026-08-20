import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionProvider.jsx'
import { toAppError } from '../lib/errors.js'
import { safeRedirectPath } from '../lib/safeRedirect.js'

export { safeRedirectPath as resolveSafeRedirectPath } from '../lib/safeRedirect.js'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { status, profile, signInWithGoogle } = useSession()
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    if (profile?.username) navigate(safeRedirectPath(location.state?.from?.pathname), { replace: true })
    else navigate('/onboarding', { replace: true })
  }, [status, profile, navigate, location.state])

  const handleGoogleLogin = async () => {
    setPending(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (rawError) {
      setError(toAppError(rawError))
      setPending(false)
    }
  }

  return (
    <div className="panel mx-auto mt-16 flex max-w-sm flex-col items-center gap-6 px-8 py-12 text-center">
      <span className="h-8 w-px bg-[#b6ff3a]" />
      <div>
        <p className="kicker">Acceso</p>
        <h1 className="mt-2 font-display text-4xl uppercase text-white">Ingresá a TorneoApuestas</h1>
        <p className="mt-2 text-[14px] text-[#9a9690]">
          Necesitas una cuenta para apostar, ver tu historial y manejar tu saldo.
        </p>
      </div>
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={pending}
        className="btn-lime w-full py-3 disabled:opacity-60"
      >
        {pending ? 'Redirigiendo…' : 'Continuar con Google'}
      </button>
      {error && (
        <p className="text-xs text-[#c81e2d]">
          {error.retryable ? 'No pudimos conectar con Google. Probá de nuevo.' : error.message}
        </p>
      )}
    </div>
  )
}
