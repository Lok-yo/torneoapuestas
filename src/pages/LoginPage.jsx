import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import { useSession } from '../auth/SessionProvider.jsx'
import { toAppError } from '../lib/errors.js'

// Allowlists the post-login return destination to an in-app, same-origin,
// relative path — never an attacker-forged absolute URL, protocol-
// relative host, or a redirect back into /login itself (which would
// loop). `location.state.from` is normally set only by RequireAuth's own
// <Navigate state={{ from: location }} />, but browser history state can
// be manipulated by a hostile prior page (e.g. via history.replaceState)
// or a crafted deep link, so it must never be trusted as-is. See
// tasks.md 6.4 and design.md threat matrix "Allowlisted same-origin
// returns prevent loops/open redirects".
export function resolveSafeRedirectPath(rawPath) {
  if (typeof rawPath !== 'string' || rawPath.length === 0) return '/'
  // Reject anything that isn't a plain in-app absolute path: absolute
  // URLs ("https://evil.com/x"), protocol-relative hosts ("//evil.com"),
  // and any other scheme (e.g. "javascript:...") all fail this check.
  if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('://')) return '/'
  // Never redirect back into the auth flow itself — avoids a login loop.
  if (rawPath === '/login' || rawPath.startsWith('/login/') || rawPath.startsWith('/login?')) return '/'
  return rawPath
}

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { status, profile, signInWithGoogle } = useSession()
  const [error, setError] = useState(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (status !== 'authenticated') return
    if (profile?.username) navigate(resolveSafeRedirectPath(location.state?.from?.pathname), { replace: true })
    else navigate('/onboarding', { replace: true })
  }, [status, profile, navigate, location.state])

  const handleGoogleLogin = async () => {
    setPending(true)
    setError(null)
    try {
      await signInWithGoogle()
      // Browser navigates away for the OAuth redirect; nothing else to do here.
    } catch (rawError) {
      setError(toAppError(rawError))
      setPending(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 rounded-3xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
      <Trophy size={32} className="text-violet-400" />
      <div>
        <h1 className="text-xl font-semibold text-zinc-50">Ingresá a TorneoApuestas</h1>
        <p className="mt-1 text-sm text-zinc-400">Organizá y seguí torneos con tu cuenta de Google.</p>
      </div>
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 py-2.5 text-sm font-semibold text-zinc-900 hover:bg-white disabled:opacity-60"
      >
        {pending ? 'Redirigiendo…' : 'Continuar con Google'}
      </button>
      {error && (
        <p className="text-xs text-rose-400">
          {error.retryable ? 'No pudimos conectar con Google. Probá de nuevo.' : error.message}
        </p>
      )}
    </div>
  )
}
