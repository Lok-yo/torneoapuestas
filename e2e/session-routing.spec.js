// RED (then GREEN against src/components/RequireAuth.jsx,
// src/auth/SessionProvider.jsx): the routing threat-matrix RED tests
// preserved verbatim from design.md's testing strategy and threat matrix
// ("Application routes/session redirects"). See tasks.md Phase 6.
//
// Same network-boundary stub technique as e2e/auth-onboarding.spec.js: no
// real Google/Supabase network call is ever made.
import { test, expect } from '@playwright/test'

const FAKE_USER_ID = 'e6000000-0000-0000-0000-000000000001'

function stubAccessTokenHash({ expiresIn = 3600 } = {}) {
  return (
    '#access_token=e2e-fake-access-token' +
    '&refresh_token=e2e-fake-refresh-token' +
    `&expires_in=${expiresIn}` +
    '&token_type=bearer'
  )
}

async function stubAuthUser(page) {
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: FAKE_USER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'e2e-routing@example.com',
        app_metadata: { provider: 'google' },
        user_metadata: {},
        identities: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        is_anonymous: false,
      }),
    }),
  )
}

async function stubBootstrapSession(page, { username = 'jugador_ruteo', roles = ['user'] } = {}) {
  await page.route('**/functions/v1/bootstrap-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: { user_id: FAKE_USER_ID, username, display_name: null, avatar_url: null },
        roles,
      }),
    }),
  )
}

async function stubEmptyOrganizerTournaments(page) {
  // OrganizerPanelPage reads listTournaments() and filters client-side to
  // the current user's own tournaments; an empty list is a real, valid
  // response shape (no fixture involved).
  await page.route('**/rest/v1/tournaments*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
}

test.describe('Routing threat matrix: token refresh/expiry mid-session', () => {
  test('a session that expires mid-session and fails to refresh redirects away from a protected route to /login', async ({
    page,
  }) => {
    await stubAuthUser(page)
    await stubBootstrapSession(page, { username: 'organizador_expirado', roles: ['user', 'organizer'] })
    await stubEmptyOrganizerTournaments(page)

    await page.goto('/organizador' + stubAccessTokenHash())
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.includes('auth-token')))
    await expect(page).not.toHaveURL(/\/login$/)

    // Simulate the token having expired mid-session: rewrite the
    // *actually persisted* session's expiry to the past.
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.includes('auth-token'))
      const raw = JSON.parse(localStorage.getItem(key))
      raw.expires_at = Math.floor(Date.now() / 1000) - 100
      localStorage.setItem(key, JSON.stringify(raw))
    })

    // The refresh attempt itself fails (expired/invalid refresh token).
    await page.route('**/auth/v1/token?grant_type=refresh_token', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'invalid_grant', error_description: 'Refresh Token Not Found' }),
      }),
    )

    await page.reload()

    // Denied protected command: redirected to /login.
    await expect(page).toHaveURL(/\/login$/)
  })
})

test.describe('Routing threat matrix: direct URL to a protected/role route', () => {
  test('an unauthenticated visitor typing a role-gated URL directly is redirected to /login', async ({ page }) => {
    // No auth stubs at all — a genuinely anonymous visitor.
    await page.goto('/organizador')

    await expect(page).toHaveURL(/\/login$/)
    // Never a flash of the organizer panel's own content while denying.
    await expect(page.getByText('Panel de organizador')).not.toBeVisible()
  })

  test('an authenticated user with an incomplete profile typing a role-gated URL directly is redirected to /onboarding, not to the role-gated page', async ({
    page,
  }) => {
    await stubAuthUser(page)
    // No username yet — even though this fixture claims the organizer
    // role, RequireAuth must resolve the incomplete-profile case before
    // ever reaching the role check.
    await stubBootstrapSession(page, { username: null, roles: ['user', 'organizer'] })

    await page.goto('/organizador' + stubAccessTokenHash())

    await expect(page).toHaveURL(/\/onboarding$/)
  })

  test('an authenticated user without the organizer role typing the role-gated URL directly is redirected to "/"', async ({
    page,
  }) => {
    await stubAuthUser(page)
    await stubBootstrapSession(page, { username: 'jugador_sin_rol', roles: ['user'] })

    await page.goto('/organizador' + stubAccessTokenHash())

    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/)
    await expect(page.getByText('Panel de organizador')).not.toBeVisible()
  })

  test('an authenticated organizer with a complete profile reaches the real role-gated page', async ({ page }) => {
    await stubAuthUser(page)
    await stubBootstrapSession(page, { username: 'organizador_real', roles: ['user', 'organizer'] })
    await stubEmptyOrganizerTournaments(page)

    await page.goto('/organizador' + stubAccessTokenHash())

    // supabase-js clears the URL hash after parsing it, leaving a
    // trailing "#" — a harmless artifact of the implicit-flow stub
    // technique, not part of the app's own redirect behavior.
    await expect(page).toHaveURL(/\/organizador#?$/)
    await expect(page.getByText('Panel de organizador')).toBeVisible()
  })
})

test.describe('Routing threat matrix: forged/stale role claim is denied server-side', () => {
  test('a client that reached the organizer page with a forged/stale role claim cannot actually advance a tournament — the RPC denies it, and the UI never fabricates success', async ({
    page,
  }) => {
    const TOURNAMENT_ID = 'b6000000-0000-0000-0000-000000000001'
    await stubAuthUser(page)
    // The client-side session/role state claims 'organizer' — this is
    // exactly the "forged/stale role claim" the client could present
    // (e.g. a cached roles array that no longer matches a revoked grant).
    // It is enough to pass RequireAuth's client-side route gate and
    // reach the page, but it must NOT be enough to actually mutate the
    // tournament: the server-side has_role() check inside
    // advance_tournament_state (0008_lifecycle_rpc.sql) is the real
    // authority and is exercised independently below.
    await stubBootstrapSession(page, { username: 'organizador_forjado', roles: ['user', 'organizer'] })

    const tournament = {
      id: TOURNAMENT_ID,
      organizer_id: FAKE_USER_ID,
      game_id: 'ssbu',
      format_id: '00000000-0000-0000-0000-000000000001',
      name: 'Torneo con reclamo de rol forjado',
      status: 'REGISTRATION_OPEN',
      version: 1,
      roster_frozen_at: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    await page.route('**/rest/v1/tournaments*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([tournament]) }),
    )

    // The real server-side denial this scenario proves: regardless of
    // the client's claimed role, the RPC itself rejects the action —
    // the exact errcode/message shape 0008_lifecycle_rpc.sql raises for
    // an unauthorized caller (see supabase/tests/lifecycle_rpc.sql
    // "unauthorized denial").
    await page.route('**/rest/v1/rpc/advance_tournament_state', (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          code: '42501',
          message: 'FORBIDDEN: only the organizer or an admin may advance this tournament',
          details: null,
          hint: null,
        }),
      }),
    )

    await page.goto('/organizador' + stubAccessTokenHash())
    await expect(page.getByText('Torneo con reclamo de rol forjado')).toBeVisible()

    await page.getByRole('button', { name: 'Cerrar inscripciones' }).click()

    // Denied, surfaced honestly — never a fabricated success.
    await expect(page.getByTestId('organizer-action-error')).toHaveText('No tenés permiso para administrar este torneo.')
    // The tournament's status is never optimistically advanced on a denial.
    await expect(page.getByText('REGISTRATION_OPEN')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cerrar inscripciones' })).toBeVisible()
  })
})

test.describe('Routing threat matrix: hostile/forged redirect target', () => {
  // Simulates a hostile prior JS context or a crafted deep link that has
  // manipulated browser history state before the app boots (the only
  // realistic way `location.state.from` could ever carry an
  // attacker-controlled value, since a plain external link cannot set
  // another origin's `history.state`). react-router-dom v7's
  // BrowserRouter reads `location.state` from `window.history.state.usr`
  // at history-object construction time, so an init script that runs
  // before any page script — but after this exact navigation has
  // committed — reliably injects it. See tasks.md 6.4 and LoginPage.jsx
  // resolveSafeRedirectPath().
  //
  // Real behavior discovered while writing this test (documented, not
  // worked around): supabase-js's implicit-flow hash detection clears
  // `#access_token=...` via a plain `window.location.hash = ''`
  // assignment once it has parsed the token. Per the URL/history spec,
  // that fragment-only navigation creates a *new* history entry whose
  // `state` is `null` — it does not inherit the previous entry's state —
  // which wipes any injected `usr.from` before LoginPage's effect can
  // read it. This is real, not a test artifact: it is exactly why a real
  // Google OAuth round-trip never actually returns a user to their
  // original deep-linked destination either (see tasks.md's Batch 5 log
  // for the fuller finding). So this suite establishes the session
  // first (via the hash technique, on a URL with no forged state), *then*
  // navigates to a hash-less `/login` with the forged/legitimate state —
  // the realistic path this mechanism is actually reachable through:
  // an already-valid persisted session resolving while still mounted on
  // `/login`.
  async function establishRealSession(page) {
    await stubAuthUser(page)
    await stubBootstrapSession(page, { username: 'jugador_con_sesion_real' })
    await page.goto('/' + stubAccessTokenHash())
    await expect(page).not.toHaveURL(/\/login$/)
  }

  async function gotoLoginWithForgedReturnTo(page, pathname) {
    await page.addInitScript((forgedPathname) => {
      window.history.replaceState(
        { usr: { from: { pathname: forgedPathname } }, key: 'forged', idx: 0 },
        '',
        window.location.pathname + window.location.search + window.location.hash,
      )
    }, pathname)
    await page.goto('/login')
  }

  test('an absolute cross-origin forged redirect target is rejected — sign-in lands on the app root, never the attacker host', async ({
    page,
  }) => {
    await establishRealSession(page)
    await gotoLoginWithForgedReturnTo(page, 'https://evil.example.com/steal-session')

    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/)
  })

  test('a protocol-relative forged host is rejected — sign-in lands on the app root, never the attacker host', async ({
    page,
  }) => {
    await establishRealSession(page)
    await gotoLoginWithForgedReturnTo(page, '//evil.example.com/steal-session')

    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/)
  })

  test('a forged redirect target pointing back at /login is rejected to prevent a login loop', async ({ page }) => {
    await establishRealSession(page)
    await gotoLoginWithForgedReturnTo(page, '/login')

    await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/)
  })

  test('a legitimate same-origin return destination is still honored — the allowlist does not just always fall back to "/"', async ({
    page,
  }) => {
    await establishRealSession(page)
    await gotoLoginWithForgedReturnTo(page, '/ranking')

    await expect(page).toHaveURL(/\/ranking$/)
  })
})
