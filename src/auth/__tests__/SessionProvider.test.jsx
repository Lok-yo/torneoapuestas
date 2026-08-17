// RED (now GREEN against src/auth/SessionProvider.jsx): proves the four
// session states named in tasks.md 2.1 — loading, anonymous, expired,
// authenticated — and that a bootstrap failure denies protected state
// (authenticated-identity spec "Provider or session failure").
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SessionProvider, useSession } from '../SessionProvider.jsx'
import { AppError } from '../../lib/errors.js'

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  bootstrapSession: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('../../repositories/sessionRepository.js', () => mocks)

function Probe() {
  const { status, profile, roles, error } = useSession()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="username">{profile?.username ?? ''}</span>
      <span data-testid="roles">{roles.join(',')}</span>
      <span data-testid="error">{error?.code ?? ''}</span>
    </div>
  )
}

function renderWithProvider() {
  return render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.onAuthStateChange.mockReturnValue(() => {})
})

describe('SessionProvider', () => {
  it('starts in loading state before the session lookup resolves', async () => {
    let resolveSession
    mocks.getCurrentSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve
      }),
    )

    renderWithProvider()

    expect(screen.getByTestId('status').textContent).toBe('loading')
    resolveSession(null)
    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'))
  })

  it('resolves to anonymous when there is no active session', async () => {
    mocks.getCurrentSession.mockResolvedValue(null)

    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('anonymous'))
    expect(mocks.bootstrapSession).not.toHaveBeenCalled()
  })

  it('resolves to authenticated with profile and roles when bootstrap succeeds', async () => {
    mocks.getCurrentSession.mockResolvedValue({ access_token: 'token', user: { id: 'user-1' } })
    mocks.bootstrapSession.mockResolvedValue({
      profile: { user_id: 'user-1', username: 'jugador1' },
      roles: ['user'],
    })

    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('authenticated'))
    expect(screen.getByTestId('username').textContent).toBe('jugador1')
    expect(screen.getByTestId('roles').textContent).toBe('user')
  })

  it('resolves to expired when bootstrap fails (recoverable auth state, protected commands denied)', async () => {
    mocks.getCurrentSession.mockResolvedValue({ access_token: 'stale', user: { id: 'user-1' } })
    mocks.bootstrapSession.mockRejectedValue(new AppError('UNAUTHENTICATED', 'Session is invalid or expired.'))

    renderWithProvider()

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('expired'))
    expect(screen.getByTestId('error').textContent).toBe('UNAUTHENTICATED')
  })

  it('subscribes to auth state changes and unsubscribes on unmount', async () => {
    mocks.getCurrentSession.mockResolvedValue(null)
    const unsubscribe = vi.fn()
    mocks.onAuthStateChange.mockReturnValue(unsubscribe)

    const { unmount } = renderWithProvider()

    await waitFor(() => expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1))
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
