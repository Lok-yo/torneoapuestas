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
    <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-5 border border-[#243028] bg-[#0c1410] p-7 text-center">
      <span className="flex h-10 w-10 items-center justify-center bg-[#c9a227] font-display text-lg font-extrabold text-[#141208]">
        C
      </span>
      <div>
        <p className="font-display text-[11px] font-bold tracking-[0.18em] text-[#c9a227]">CAJA</p>
        <h1 className="font-display text-2xl font-extrabold uppercase text-[#f0e6c8]">Ingresá a TorneoApuestas</h1>
        <p className="mt-1 text-[13px] text-[#8a9080]">Organizá y seguí torneos con tu cuenta de Google.</p>
      </div>
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={pending}
        className="w-full bg-[#c9a227] py-2.5 text-[13px] font-bold text-[#141208] hover:bg-[#ddb83a] disabled:opacity-60"
      >
        {pending ? 'Redirigiendo…' : 'Continuar con Google'}
      </button>
      {error && (
        <p className="text-xs text-[#ff4d5a]">
          {error.retryable ? 'No pudimos conectar con Google. Probá de nuevo.' : error.message}
        </p>
      )}
    </div>
  )
}
