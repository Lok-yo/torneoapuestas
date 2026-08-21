// RED (now GREEN): CreateMarketPage must show an on-chain active market as
// "Mercado activo" + disabled even when the Supabase has_market cache is
// false (tasks.md 4.3-4.5). Reads market state through the existing
// useMarket(questionId) hook per set (SetMarketOption) and per player
// (EntrantMarketOption). Mock shape mirrors BracketSection.test.jsx.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreateMarketPage from '../CreateMarketPage.jsx'

const { listTournamentSets, checkDuplicateMarketByQuestionId } = vi.hoisted(() => ({
  listTournamentSets: vi.fn(),
  checkDuplicateMarketByQuestionId: vi.fn(),
}))

vi.mock('../../repositories/tournamentRepository.js', () => ({
  listTournamentSets: (...a) => listTournamentSets(...a),
  checkDuplicateMarketByQuestionId: (...a) => checkDuplicateMarketByQuestionId(...a),
}))

vi.mock('../../lib/web3/hooks.js', () => ({
  useMarket: vi.fn(() => ({ market: { state: 3 } })),
  useWalletConnect: () => ({ isConnected: false, connectors: [], connect: vi.fn(), connectError: null, isCorrectChain: false, switchToAmoy: vi.fn() }),
  useCreateMarket: () => ({ createMarket: vi.fn(), isPending: false }),
}))

// The combobox is a separate debounced component; stub it as a button that
// selects the tournament directly so this test focuses on market options.
vi.mock('../../components/TournamentSearchCombobox.jsx', () => ({
  default: ({ onSelect }) => (
    <button type="button" onClick={() => onSelect({ id: 't1', name: 'Torneo', game_id: 'ssbu', created_at: null, startgg_event_id: 123 })}>
      select-tournament
    </button>
  ),
}))

import { useMarket } from '../../lib/web3/hooks.js'
import { matchQuestionId, tournamentWinnerQuestionId } from '../../lib/web3/questionId.js'

const ACTIVE_ONCHAIN_SET = {
  startgg_set_id: 1,
  tournament_id: 't1',
  round: 1,
  slot: 0,
  state: 'PENDING',
  entrant_a_name: 'Alpha',
  entrant_b_name: 'Bravo',
  has_market: false, // cache says NO market; on-chain says it exists
}

const CLEAR_SET = {
  ...ACTIVE_ONCHAIN_SET,
  startgg_set_id: 2,
  entrant_a_name: 'Charlie',
  entrant_b_name: 'Delta',
}

// Set 1 and player Alpha have live on-chain markets; everything else is NONE.
const ACTIVE_QIDS = [matchQuestionId(123, 1), tournamentWinnerQuestionId(123, 'Alpha')]

beforeEach(() => {
  vi.clearAllMocks()
  listTournamentSets.mockResolvedValue([ACTIVE_ONCHAIN_SET, CLEAR_SET])
  checkDuplicateMarketByQuestionId.mockResolvedValue(false)
  useMarket.mockImplementation((qid) => ({
    market: { state: ACTIVE_QIDS.includes(String(qid)) ? 3 : 0 },
  }))
})

async function selectTournament() {
  render(
    <MemoryRouter>
      <CreateMarketPage />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('select-tournament'))
  await act(async () => {}) // flush listTournamentSets
}

describe('CreateMarketPage on-chain duplicate detection', () => {
  it('marks a set as "Mercado activo" and disables it when on-chain market state !== 0 even with has_market=false', async () => {
    await selectTournament()

    expect(screen.getByText('Alpha vs Bravo')).toBeDefined()
    const activeButton = screen.getByText('Alpha vs Bravo').closest('button')
    expect(activeButton).toBeDisabled()

    const badges = screen.getAllByText('Mercado activo')
    expect(badges).toHaveLength(1) // only the on-chain active set
    expect(screen.getByText('Charlie vs Delta').closest('button')).toBeEnabled()
  })

  it('queries the on-chain market for each set questionId', async () => {
    await selectTournament()

    const qids = useMarket.mock.calls.map(([qid]) => String(qid))
    expect(qids).toHaveLength(2)
    // matchQuestionId(eventId=123, set 1) and set 2 — deterministic keccak hashes
    expect(qids[0]).toMatch(/^0x[0-9a-f]{64}$/)
    expect(qids[0]).not.toBe(qids[1])
  })

  it('shows no badge and enables the set when on-chain state is 0 (no market)', async () => {
    useMarket.mockReturnValue({ market: { state: 0 } })
    await selectTournament()

    expect(screen.queryByText('Mercado activo')).toBeNull()
    expect(screen.getByText('Alpha vs Bravo').closest('button')).toBeEnabled()
  })

  it('marks a player in "Ganador del torneo" with a badge + disabled when their market exists', async () => {
    await selectTournament()

    fireEvent.change(screen.getByLabelText(/Tipo de mercado/), { target: { value: '1' } })

    const alphaButton = screen.getByText('Alpha').closest('button')
    expect(alphaButton).toBeDisabled()
    expect(alphaButton).toHaveTextContent('Mercado activo')

    const charlieButton = screen.getByText('Charlie').closest('button')
    expect(charlieButton).toBeEnabled()
  })
})