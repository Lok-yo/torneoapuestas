// RED (now GREEN): the modal's form must treat seedLiquidity < 100 as
// invalid — matching MIN_LIQUIDITY_USDC and the min="100" input — instead
// of the old < 1 check (tasks.md 4.1-4.2). '50' disables submit; '100'
// enables it.
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CreateMarketModal from '../CreateMarketModal.jsx'

vi.mock('../../lib/web3/hooks.js', () => ({
  useWalletConnect: () => ({ isConnected: true, connectors: [], connect: vi.fn(), connectError: null, isCorrectChain: true, switchToAmoy: vi.fn() }),
  useCreateMarket: () => ({ createMarket: vi.fn(), isPending: false }),
  useHouseAccount: () => ({ account: { balance: 1_000_000n, deposited: 0n, inPlay: 0n, withdrawable: 0n } }),
}))

const SET = {
  startgg_set_id: 7,
  tournament_id: 't1',
  round: 1,
  slot: 0,
  state: 'PENDING',
  entrant_a_name: 'Alpha',
  entrant_b_name: 'Bravo',
  has_market: false,
  startgg_event_id: 123,
  event_starts_at: null,
}

function renderModal() {
  return render(
    <MemoryRouter>
      <CreateMarketModal set={SET} startggEventId={123} onClose={vi.fn()} />
    </MemoryRouter>,
  )
}

function submitButton() {
  return screen.getByRole('button', { name: /Pagar y Crear Mercado/ })
}

describe('CreateMarketModal liquidity validation', () => {
  it('blocks submit below the 100 USDC minimum', () => {
    renderModal()
    const input = screen.getByLabelText(/Liquidez inicial/)
    fireEvent.change(input, { target: { value: '50' } })
    expect(submitButton()).toBeDisabled()
  })

  it('allows submit at exactly 100 USDC', () => {
    renderModal()
    const input = screen.getByLabelText(/Liquidez inicial/)
    fireEvent.change(input, { target: { value: '100' } })
    expect(submitButton()).toBeEnabled()
  })

  it('shows the minimum hint below 100 and hides it at 100', () => {
    renderModal()
    const input = screen.getByLabelText(/Liquidez inicial/)
    fireEvent.change(input, { target: { value: '50' } })
    expect(screen.getByText('Mínimo 100 USDC')).toBeDefined()
    fireEvent.change(input, { target: { value: '100' } })
    expect(screen.queryByText('Mínimo 100 USDC')).toBeNull()
  })
})