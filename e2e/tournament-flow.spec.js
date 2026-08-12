// RED (now GREEN against src/pages/TournamentDetailPage.jsx,
// src/repositories/{tournamentRepository,bracketRepository,resultRepository}.js):
// registration -> freeze -> bracket -> organizer result -> public
// projection, plus a dependency-outage truthful-unavailable state. See
// tasks.md 3.14 and tournament-operations spec.
//
// Same network-boundary stub technique as e2e/auth-onboarding.spec.js: no
// real Google/Supabase network call is ever made. The tournament/bracket
// "database" here is one small in-memory object per test, mutated by the
// RPC/Edge-Function route handlers exactly the way the real RPCs
// (0008-0011_*.sql) mutate Postgres — this proves the UI wiring, while
// the RPCs' own invariants (concurrency, idempotency, authority) are
// proven separately against a real Postgres container by the pgTAP
// suites in supabase/tests/.
import { test, expect } from '@playwright/test'

const ORGANIZER_ID = 'e2e00000-0000-0000-0000-0000000000a1'
const FORMAT_ID = '00000000-0000-0000-0000-000000000001'
const TOURNAMENT_ID = 'b9000000-0000-0000-0000-000000000001'

function stubAccessTokenHash() {
  return '#access_token=e2e-fake-access-token&refresh_token=e2e-fake-refresh-token&expires_in=3600&token_type=bearer'
}

async function stubOrganizerSession(page) {
  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: ORGANIZER_ID,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'e2e-organizer@example.com',
        app_metadata: { provider: 'google' },
        user_metadata: {},
        identities: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        is_anonymous: false,
      }),
    }),
  )

  await page.route('**/functions/v1/bootstrap-session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: { user_id: ORGANIZER_ID, username: 'organizador_e2e', display_name: null, avatar_url: null },
        roles: ['user', 'organizer'],
      }),
    }),
  )
}

function makeTournamentState() {
  return {
    id: TOURNAMENT_ID,
    organizer_id: ORGANIZER_ID,
    game_id: 'ssbu',
    format_id: FORMAT_ID,
    name: 'E2E Showdown',
    status: 'REGISTRATION_OPEN',
    version: 1,
    roster_frozen_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

const FORMAT_FIXTURE = {
  id: FORMAT_ID,
  game_id: 'ssbu',
  name: 'SSBU Singles — 8-Player Single Elimination',
  roster_size: 8,
  best_of: 3,
  ruleset: { stocks: 3, clockMinutes: 7, items: 'off', stageSelection: 'striking_counterpick' },
  ruleset_version: 1,
}

const READY_MATCH = {
  match_id: 'e9000000-0000-0000-0000-000000000001',
  bracket_id: 'd9000000-0000-0000-0000-000000000001',
  tournament_id: TOURNAMENT_ID,
  round: 1,
  slot: 0,
  next_match_id: 'e9000000-0000-0000-0000-000000000005',
  next_match_slot: 'A',
  status: 'READY',
  participant_a_username: 'jugador_uno',
  participant_b_username: 'jugador_dos',
  games_won_a: null,
  games_won_b: null,
  result_status: null,
}

async function stubTournamentBackend(page, state) {
  await page.route('**/rest/v1/tournaments*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.tournament) }),
  )

  await page.route('**/rest/v1/tournament_formats*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FORMAT_FIXTURE) }),
  )

  await page.route('**/rest/v1/memberships*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.membership) }),
  )

  await page.route('**/rest/v1/rpc/register_participant', async (route) => {
    state.membership = { id: 'c9000000-0000-0000-0000-000000000001', status: 'REGISTERED', seed: null }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'registered', membershipId: state.membership.id }),
    })
  })

  await page.route('**/rest/v1/public_brackets_view*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.bracket) }),
  )

  await page.route('**/rest/v1/rpc/advance_tournament_state', async (route) => {
    const body = route.request().postDataJSON()
    if (body.p_action === 'CLOSE_REGISTRATION') {
      state.tournament.status = 'REGISTRATION_CLOSED'
      state.tournament.roster_frozen_at = '2026-01-02T00:00:00Z'
      state.tournament.version += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'transitioned', newStatus: 'REGISTRATION_CLOSED', version: state.tournament.version }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'invalid_transition' }) })
  })

  await page.route('**/rest/v1/rpc/generate_bracket', async (route) => {
    state.bracket = [READY_MATCH]
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'created', bracketId: 'd9000000-0000-0000-0000-000000000001' }),
    })
  })

  await page.route('**/functions/v1/result-command', async (route) => {
    const body = route.request().postDataJSON()
    state.bracket = state.bracket.map((m) =>
      m.match_id === body.matchId
        ? { ...m, status: 'COMPLETED', games_won_a: body.gamesWonA, games_won_b: body.gamesWonB, result_status: 'OFFICIAL' }
        : m,
    )
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'accepted', resultId: 'f9000000-0000-0000-0000-000000000001' }),
    })
  })
}

test.describe('Tournament operations: registration -> freeze -> bracket -> official result', () => {
  test('a participant registers, the organizer closes registration, generates the bracket, and submits an official result', async ({
    page,
  }) => {
    // Closes a real gap found while verifying proposal.md's success
    // criteria end-to-end (tasks.md 7.3): registration itself
    // (register_participant) previously had no Playwright coverage at
    // all — only pgTAP (roster_concurrency.sql) and domain unit tests
    // (registration.test.js) — even though the proposal's own success
    // criterion describes one continuous "register, pass roster freeze,
    // and see..." flow. The same stubbed session both registers as a
    // participant and (separately, as the tournament's real organizer)
    // performs the organizer actions below — a real, permitted scenario,
    // not a test artifact.
    const state = { tournament: makeTournamentState(), bracket: [], membership: null }
    await stubOrganizerSession(page)
    await stubTournamentBackend(page, state)

    await page.goto(`/torneos/${TOURNAMENT_ID}` + stubAccessTokenHash())

    await expect(page.getByText('E2E Showdown')).toBeVisible()
    await expect(page.getByText('Inscripciones abiertas')).toBeVisible()

    // A participant registers.
    await page.getByRole('button', { name: 'Inscribirme' }).click()
    await expect(page.getByRole('button', { name: 'Darme de baja' })).toBeVisible()

    // Organizer closes registration -> roster freeze.
    await page.getByRole('button', { name: 'Cerrar inscripciones' }).click()
    await expect(page.getByText('Roster cerrado')).toBeVisible()

    // Organizer generates the bracket.
    await page.getByRole('button', { name: 'Generar bracket' }).click()
    await expect(page.getByText('jugador_uno')).toBeVisible()
    await expect(page.getByText('jugador_dos')).toBeVisible()

    // Organizer submits the official result for the READY match.
    const scoreInputs = page.locator('input[type="number"]')
    await scoreInputs.nth(0).fill('2')
    await scoreInputs.nth(1).fill('0')
    await page.getByRole('button', { name: 'Cargar resultado' }).click()

    // Public projection reflects the official score after the reload.
    await expect(page.getByText('2 - 0')).toBeVisible()
  })

  test('a bracket-projection outage shows a truthful unavailable state, never fabricated data', async ({ page }) => {
    const state = { tournament: makeTournamentState(), bracket: [] }
    await stubOrganizerSession(page)
    await page.route('**/rest/v1/tournaments*', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'service unavailable' }) }),
    )
    await page.route('**/rest/v1/tournament_formats*', (route) => route.abort())
    await page.route('**/rest/v1/memberships*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }))
    await page.route('**/rest/v1/public_brackets_view*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state.bracket) }),
    )

    await page.goto(`/torneos/${TOURNAMENT_ID}` + stubAccessTokenHash())

    // supabase-js retries a 503 GET several times with backoff before
    // giving up (real resilience behavior, not a bug) — this genuinely
    // takes longer than the default assertion timeout to settle.
    await expect(page.getByText(/no pudimos cargar este torneo/i)).toBeVisible({ timeout: 20000 })
    // Never a fabricated tournament name/status while the dependency is down.
    await expect(page.getByText('E2E Showdown')).not.toBeVisible()
  })

  test('an authenticated organizer creates a tournament from zero on /organizador', async ({ page }) => {
    let tournaments = []
    await stubOrganizerSession(page)

    await page.route('**/rest/v1/tournaments*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tournaments) }),
    )

    await page.route('**/rest/v1/rpc/create_tournament', async (route) => {
      const body = route.request().postDataJSON()
      const newT = {
        id: 'b9000000-0000-0000-0000-000000000099',
        organizer_id: ORGANIZER_ID,
        game_id: body.p_game_id ?? 'ssbu',
        format_id: body.p_format_id ?? FORMAT_ID,
        name: body.p_name,
        status: 'DRAFT',
        version: 1,
        roster_frozen_at: null,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      }
      tournaments = [newT]
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'created',
          tournamentId: newT.id,
          name: newT.name,
          organizerId: newT.organizer_id,
          gameId: newT.game_id,
          formatId: newT.format_id,
          tournamentStatus: newT.status,
        }),
      })
    })

    await page.goto('/organizador' + stubAccessTokenHash())

    await expect(page.getByText('Panel de organizador')).toBeVisible()
    await expect(page.getByText('No organizás ningún torneo todavía.')).toBeVisible()

    const nameInput = page.getByPlaceholder('Nombre del torneo')
    await nameInput.fill('Torneo Creado Desde Cero')
    await page.getByRole('button', { name: 'Crear torneo' }).click()

    await expect(page.getByText('Torneo Creado Desde Cero')).toBeVisible()
    await expect(page.getByText('DRAFT')).toBeVisible()
  })
})

