// RED (now GREEN against src/auth/SessionProvider.jsx, src/pages/{LoginPage,
// OnboardingUsernamePage}.jsx, src/components/RequireAuth.jsx): OAuth-stub
// sign-in -> onboarding -> collision/throttle -> protected-route access.
// See tasks.md 2.10 and design.md Testing Strategy ("Playwright: OAuth-stub
// bootstrap, collision/throttle, protected/role routes").
//
// This stub never talks to a real Google/Supabase Auth service. It
// intercepts the exact network boundary a real implicit-flow OAuth
// redirect leaves behind:
//   1. Navigating to the app with `#access_token=...` in the URL hash is
//      byte-for-byte what Supabase Auth's own redirect back from Google
//      produces (implicit flow) — see @supabase/auth-js
//      `_getSessionFromURL`.
//   2. supabase-js then calls `GET /auth/v1/user` with that access token
//      to fetch the full user object — intercepted below.
//   3. Our app's own boundaries (`POST /functions/v1/bootstrap-session`,
//      `POST /rest/v1/rpc/claim_username`) are intercepted with
//      deterministic fixture responses instead of a live backend.
import { test, expect } from '@playwright/test'

const FAKE_USER_ID = 'e2e00000-0000-0000-0000-000000000001'

function stubAccessTokenHash() {
  return (
    '#access_token=e2e-fake-access-token' +
    '&refresh_token=e2e-fake-refresh-token' +
    '&expires_in=3600' +
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
        email: 'e2e-player@example.com',
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

async function stubBootstrapSession(page, { username = null } = {}) {
  await page.route('**/functions/v1/bootstrap-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: { user_id: FAKE_USER_ID, username, display_name: null, avatar_url: null },
        roles: ['user'],
      }),
    }),
  )
}

async function stubClaimUsername(page, resultByUsername) {
  await page.route('**/rest/v1/rpc/claim_username', async (route) => {
    const body = route.request().postDataJSON()
    const outcome = resultByUsername(body.p_username)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(outcome) })
  })
}

test.describe('Authenticated identity: OAuth-stub sign-in and onboarding', () => {
  test('a fresh sign-in with no username is routed to onboarding', async ({ page }) => {
    await stubAuthUser(page)
    await stubBootstrapSession(page, { username: null })

    await page.goto('/' + stubAccessTokenHash())

    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByRole('heading', { name: 'Elegí tu usuario' })).toBeVisible()
  })

  test('a taken username shows a collision error and does not navigate away', async ({ page }) => {
    await stubAuthUser(page)
    await stubBootstrapSession(page, { username: null })
    await stubClaimUsername(page, (username) =>
      username === 'yataken' ? { status: 'conflict', usernameNormalized: 'yataken' } : { status: 'claimed' },
    )

    await page.goto('/' + stubAccessTokenHash())
    await expect(page).toHaveURL(/\/onboarding$/)

    await page.getByPlaceholder('tu_usuario').fill('yataken')
    await page.getByRole('button', { name: 'Continuar' }).click()

    await expect(page.getByText('Ese usuario ya está en uso.')).toBeVisible()
    await expect(page).toHaveURL(/\/onboarding$/)
  })

  test('a throttled claim shows the rate-limit message and does not navigate away', async ({ page }) => {
    await stubAuthUser(page)
    await stubBootstrapSession(page, { username: null })
    await stubClaimUsername(page, () => ({ status: 'rate_limited' }))

    await page.goto('/' + stubAccessTokenHash())
    await page.getByPlaceholder('tu_usuario').fill('cualquiercosa')
    await page.getByRole('button', { name: 'Continuar' }).click()

    await expect(page.getByText(/demasiados intentos/i)).toBeVisible()
    await expect(page).toHaveURL(/\/onboarding$/)
  })

  test('a successful claim leaves onboarding and reaches a protected route', async ({ page }) => {
    await stubAuthUser(page)
    let claimed = false
    await page.route('**/functions/v1/bootstrap-session', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          profile: { user_id: FAKE_USER_ID, username: claimed ? 'jugador_libre' : null },
          roles: ['user'],
        }),
      }),
    )
    await stubClaimUsername(page, (username) => {
      claimed = true
      return { status: 'claimed', username, usernameNormalized: username.toLowerCase() }
    })

    await page.goto('/' + stubAccessTokenHash())
    await expect(page).toHaveURL(/\/onboarding$/)

    await page.getByPlaceholder('tu_usuario').fill('jugador_libre')
    await page.getByRole('button', { name: 'Continuar' }).click()

    await expect(page).toHaveURL(/\/$/)

    // Protected route: an authenticated user with a completed profile can
    // reach a RequireAuth-gated route without being bounced to /login.
    await page.goto('/wallet')
    await expect(page).not.toHaveURL(/\/login$/)
  })

  test('an unauthenticated visitor to a protected route is redirected to /login', async ({ page }) => {
    await page.goto('/wallet')
    await expect(page).toHaveURL(/\/login$/)
  })
})
