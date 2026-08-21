// RED (now GREEN): when an entrant name is null/'Por definir', MatchCard must
// show no "Apostar" button and render the i18n waiting-players tooltip
// (tasks.md 5.3-5.4, tournament-bracket R3).
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import MatchCard from '../MatchCard.jsx'

vi.mock('../../lib/web3/hooks.js', () => ({
  useMarket: () => ({ market: null, isLoading: false, error: null }),
}))

// Simulate the real es dictionary entry the component must read.
vi.mock('../../i18n/I18nProvider.jsx', () => ({
  useI18n: () => ({
    t: (key) => (key === 'match.waitingPlayers' ? 'Esperando jugadores...' : key),
  }),
}))

const NO_ENTRANT_SET = {
  startgg_set_id: 10,
  tournament_id: 't1',
  round: 1,
  slot: 0,
  state: 'PENDING',
  entrant_a_name: null,
  entrant_b_name: 'Player B',
  startgg_event_id: 123,
  has_market: false,
}

const READY_SET = {
  ...NO_ENTRANT_SET,
  startgg_set_id: 11,
  entrant_a_name: 'Player A',
}

describe('MatchCard waiting-players tooltip', () => {
  it('shows no "Apostar" button when an entrant name is missing', () => {
    render(
      <MemoryRouter>
        <MatchCard set={NO_ENTRANT_SET} onSelect={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('button', { name: /Apostar/ })).toBeNull()
  })

  it('renders the waiting-players tooltip title when an entrant is missing', () => {
    render(
      <MemoryRouter>
        <MatchCard set={NO_ENTRANT_SET} onSelect={vi.fn()} />
      </MemoryRouter>,
    )
    const tooltip = screen.getByTitle('Esperando jugadores...')
    expect(tooltip).toBeDefined()
    expect(tooltip.textContent).toBe('Esperando jugadores...')
  })

  it('still offers "Apostar" when both entrant names are known', () => {
    render(
      <MemoryRouter>
        <MatchCard set={READY_SET} onSelect={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /Apostar/ })).toBeDefined()
  })
})