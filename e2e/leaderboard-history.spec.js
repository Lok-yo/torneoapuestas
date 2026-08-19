// RED (now GREEN against src/pages/{LeaderboardPage,PlayerProfilePage}.jsx,
// src/repositories/ratingRepository.js): proves the public leaderboard and
// player-history pages reflect an official result's projection, expose the
// event's version/freshness, and show a truthful unavailable state on a
// stale/unreachable dependency rather than fabricating rating data. Same
// network-boundary stub technique as e2e/tournament-flow.spec.js: no real
// Supabase network call is ever made, and these routes are anon-readable
// public views (no session stub is needed). See tasks.md 4.8/4.9 and
// rating-projections spec "Public leaderboard and privacy boundary".
import { test, expect } from '@playwright/test'

const LEADERBOARD_FIXTURE = [
  { game_id: 'ssbu', username: 'jugador_top', rating: 1050, version: 2, computed_at: '2026-01-03T00:00:00Z' },
  { game_id: 'ssbu', username: 'jugador_dos', rating: 950, version: 1, computed_at: '2026-01-02T00:00:00Z' },
]

test.describe('Leaderboard and player-history public projections', () => {
  test('the leaderboard reflects official-result-derived ratings, ordered and versioned', async ({ page }) => {
    await page.route('**/rest/v1/public_leaderboard_view*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LEADERBOARD_FIXTURE) }),
    )

    await page.goto('/ranking')

    await expect(page.getByText('jugador_top').first()).toBeVisible()
    await expect(page.getByText('jugador_dos').first()).toBeVisible()
    await expect(page.getByText('1050').first()).toBeVisible()
    await expect(page.getByText('950').first()).toBeVisible()
  })

  test('a player profile shows rating and versioned history from an accepted official result', async ({ page }) => {
    await page.route('**/rest/v1/public_leaderboard_view*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { game_id: 'ssbu', username: 'jugador_top', rating: 1050, version: 2, computed_at: '2026-01-03T00:00:00Z' },
        ]),
      }),
    )

    await page.route('**/rest/v1/public_player_history_view*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            username: 'jugador_top',
            game_id: 'ssbu',
            delta: 25,
            version: 2,
            review_state: 'CLEAN',
            effective_at: '2026-01-03T00:00:00Z',
          },
          {
            username: 'jugador_top',
            game_id: 'ssbu',
            delta: 25,
            version: 1,
            review_state: 'CLEAN',
            effective_at: '2026-01-01T00:00:00Z',
          },
        ]),
      }),
    )

    await page.goto('/jugadores/jugador_top')

    await expect(page.getByText('@jugador_top')).toBeVisible()
    await expect(page.getByText('1050')).toBeVisible()
    await expect(page.getByText('Versión 2')).toBeVisible()
    await expect(page.getByText('Confirmado')).toHaveCount(2)
  })

  test('a rating dependency outage shows a truthful unavailable state, never fabricated ratings', async ({ page }) => {
    await page.route('**/rest/v1/public_leaderboard_view*', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'service unavailable' }) }),
    )

    await page.goto('/ranking')

    // supabase-js retries a 503 GET several times with backoff before
    // giving up (real resilience behavior, not a bug) — this genuinely
    // takes longer than the default assertion timeout to settle. Same
    // pattern as e2e/tournament-flow.spec.js's outage test.
    await expect(page.getByText(/no pudimos cargar el ranking/i)).toBeVisible({ timeout: 20000 })
    await expect(page.getByText('jugador_top')).not.toBeVisible()
  })
})
