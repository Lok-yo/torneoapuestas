// RED (now GREEN): the 30s auto-refresh must stop once the tournament is
// COMPLETED and must be cleared on unmount (tasks.md 3.1-3.2). Proves the
// interval lifecycle with fake timers: COMPLETED -> no refetch after 31s,
// IN_PROGRESS -> refetch keeps happening, unmount -> interval released.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TournamentDetailPage from '../TournamentDetailPage.jsx'

const { getTournament, getTournamentFormat, listTournamentSets } = vi.hoisted(() => ({
  getTournament: vi.fn(),
  getTournamentFormat: vi.fn(),
  listTournamentSets: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useParams: () => ({ id: 't1' }),
}))

vi.mock('../../repositories/tournamentRepository.js', () => ({
  getTournament: (...args) => getTournament(...args),
  getTournamentFormat: (...args) => getTournamentFormat(...args),
  listTournamentSets: (...args) => listTournamentSets(...args),
}))

// Child widgets import web3 hooks at module level; never rendered in this
// test (default tab is 'descripcion'), but the mocks keep the graph intact.
vi.mock('../../lib/web3/hooks.js', () => ({
  useMarket: () => ({ market: null, isLoading: false, error: null }),
  useWalletConnect: () => ({ isConnected: false, connectors: [], connect: vi.fn(), connectError: null, isCorrectChain: false, switchToAmoy: vi.fn() }),
  useHouseTrade: () => ({ placeBet: vi.fn(), isPending: false }),
  useHouseAccount: () => ({ account: { balance: 0n, deposited: 0n, inPlay: 0n, withdrawable: 0n } }),
}))

vi.mock('../../auth/SessionProvider.jsx', () => ({
  useSession: () => ({ status: 'anonymous', profile: null, session: null }),
}))

const COMPLETED_TOURNAMENT = {
  id: 't1',
  name: 'Torneo Finalizado',
  game_id: 'ssbu',
  status: 'COMPLETED',
  format_id: 'f1',
  startgg_event_id: 123,
  created_at: null,
}

const FORMAT = { id: 'f1', game_id: 'ssbu', name: 'Doble eliminación', roster_size: 8, best_of: 3, bracket_type: 'double_elimination' }

const SETS = [{ startgg_set_id: 1, tournament_id: 't1', round: 1, slot: 0, state: 'COMPLETED', entrant_a_name: 'A', entrant_b_name: 'B', has_market: false }]

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

async function renderPage(tournament = COMPLETED_TOURNAMENT) {
  getTournament.mockResolvedValue(tournament)
  getTournamentFormat.mockResolvedValue(FORMAT)
  listTournamentSets.mockResolvedValue(SETS)
  render(
    <MemoryRouter initialEntries={['/torneos/t1']}>
      <TournamentDetailPage />
    </MemoryRouter>,
  )
  await act(async () => {}) // flush the initial async load
}

describe('TournamentDetailPage 30s refresh lifecycle', () => {
  it('stops the interval once the tournament is COMPLETED', async () => {
    await renderPage()

    expect(listTournamentSets).toHaveBeenCalledTimes(1)

    await act(async () => { vi.advanceTimersByTime(31000) })
    expect(listTournamentSets).toHaveBeenCalledTimes(1) // no second fetch — interval cleared
  })

  it('keeps refreshing every 30s while the tournament is IN_PROGRESS', async () => {
    await renderPage({ ...COMPLETED_TOURNAMENT, status: 'IN_PROGRESS' })

    expect(listTournamentSets).toHaveBeenCalledTimes(1)

    await act(async () => { vi.advanceTimersByTime(31000) })
    expect(listTournamentSets).toHaveBeenCalledTimes(2)

    await act(async () => { vi.advanceTimersByTime(31000) })
    expect(listTournamentSets).toHaveBeenCalledTimes(3)
  })

  it('clears the interval on unmount so no refetch fires after leaving', async () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/torneos/t1']}>
        <TournamentDetailPage />
      </MemoryRouter>,
    )
    await act(async () => {})
    expect(listTournamentSets).toHaveBeenCalledTimes(1)

    unmount()
    await act(async () => { vi.advanceTimersByTime(31000) })
    expect(listTournamentSets).toHaveBeenCalledTimes(1)
  })
})