import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import BracketSection from '../BracketSection.jsx'

vi.mock('../../repositories/tournamentRepository.js', () => ({
  listTournamentSets: vi.fn(),
}))

import { listTournamentSets } from '../../repositories/tournamentRepository.js'

const PENDING_SETS = [
  {
    startgg_set_id: 42,
    tournament_id: 't-ssbu',
    round: 1,
    slot: 1,
    state: 'PENDING',
    entrant_a_name: 'Mang0',
    entrant_b_name: 'Leffen',
    has_market: false,
  },
  {
    startgg_set_id: 43,
    tournament_id: 't-ssbu',
    round: 1,
    slot: 2,
    state: 'PENDING',
    entrant_a_name: 'Hungrybox',
    entrant_b_name: 'Plup',
    has_market: false,
  },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BracketSection integration: PENDING sets → Apostar click', () => {
  it('renders PENDING sets with "Apostar" buttons and calls onSelectSet when clicked', async () => {
    listTournamentSets.mockResolvedValue(PENDING_SETS)
    const onSelectSet = vi.fn()
    render(<BracketSection tournamentId="t-ssbu" onSelectSet={onSelectSet} />)

    await waitFor(() => {
      expect(screen.getByText('Mang0')).toBeDefined()
    })

    const apostarButtons = screen.getAllByText('Apostar')
    expect(apostarButtons).toHaveLength(2)

    fireEvent.click(apostarButtons[0])
    expect(onSelectSet).toHaveBeenCalledTimes(1)
    expect(onSelectSet).toHaveBeenCalledWith(PENDING_SETS[0])
  })

  it('does not show "Apostar" for COMPLETED sets', async () => {
    listTournamentSets.mockResolvedValue([
      { ...PENDING_SETS[0], state: 'COMPLETED', winner_startgg_id: null, entrant_a_startgg_id: null, entrant_b_startgg_id: null },
    ])
    render(<BracketSection tournamentId="t-ssbu" onSelectSet={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Mang0')).toBeDefined()
    })

    expect(screen.queryByText('Apostar')).toBeNull()
    expect(screen.getAllByText('Finalizado').length).toBeGreaterThanOrEqual(1)
  })
})
