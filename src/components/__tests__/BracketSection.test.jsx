import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import BracketSection from '../BracketSection.jsx'

vi.mock('../../repositories/tournamentRepository.js', () => ({
  listTournamentSets: vi.fn(),
}))

import { listTournamentSets } from '../../repositories/tournamentRepository.js'

const mockSets = [
  { startgg_set_id: 1, tournament_id: 't1', round: 1, slot: 1, state: 'COMPLETED', entrant_a_name: 'Alpha', entrant_b_name: 'Bravo', has_market: false },
  { startgg_set_id: 2, tournament_id: 't1', round: 1, slot: 2, state: 'COMPLETED', entrant_a_name: 'Charlie', entrant_b_name: 'Delta', has_market: false },
  { startgg_set_id: 3, tournament_id: 't1', round: 2, slot: 1, state: 'PENDING', entrant_a_name: 'Alpha', entrant_b_name: 'Charlie', has_market: false },
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BracketSection round grouping', () => {
  it('renders a column per unique round, sorted ascending', async () => {
    listTournamentSets.mockResolvedValue(mockSets)
    render(<BracketSection tournamentId="t1" />)

    await waitFor(() => {
      expect(screen.getByText('Grand Finals')).toBeDefined()
    })

    expect(screen.getByText('Winners Finals')).toBeDefined()
    const headings = screen.getAllByRole('heading')
    const roundHeadings = headings.map((h) => h.textContent)
    const gfIdx = roundHeadings.indexOf('Grand Finals')
    const wfIdx = roundHeadings.indexOf('Winners Finals')
    expect(gfIdx).toBeLessThan(wfIdx)
  })

  it('renders all participant names across rounds', async () => {
    listTournamentSets.mockResolvedValue(mockSets)
    render(<BracketSection tournamentId="t1" />)

    await waitFor(() => {
      expect(screen.getByText('Bravo')).toBeDefined()
    })

    expect(screen.getAllByText('Alpha').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Bravo')).toBeDefined()
    expect(screen.getAllByText('Charlie').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Delta')).toBeDefined()
  })

  it('shows empty state when no sets exist', async () => {
    listTournamentSets.mockResolvedValue([])
    render(<BracketSection tournamentId="t1" />)

    await waitFor(() => {
      expect(screen.getByText(/bracket todavía no fue generado/)).toBeDefined()
    })
  })

  it('shows error state when listTournamentSets rejects', async () => {
    listTournamentSets.mockRejectedValue(new Error('network'))
    render(<BracketSection tournamentId="t1" />)

    await waitFor(() => {
      expect(screen.getByText(/No se pudo cargar el bracket/)).toBeDefined()
    })
  })
})
