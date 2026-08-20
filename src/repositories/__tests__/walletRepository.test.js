import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getWallet, withdrawFunds, depositFunds, getTransactionHistory } from '../walletRepository.js'
import { supabase } from '../../lib/supabase.js'

vi.mock('../../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

describe('walletRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getWallet fetches wallet via get_or_create_wallet RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ user_id: 'u1', balance: '100.00', locked_balance: '0.00', available_balance: '100.00', currency: 'USD' }],
      error: null,
    })

    const wallet = await getWallet()

    expect(supabase.rpc).toHaveBeenCalledWith('get_or_create_wallet')
    expect(wallet).toEqual({
      balance: 100,
      locked_balance: 0,
      available_balance: 100,
      currency: 'USD',
    })
  })

  it('depositFunds credits balance via deposit_funds RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ balance: '150.00', locked_balance: '0.00', available_balance: '150.00' }],
      error: null,
    })

    const wallet = await depositFunds(50, 'ref-1')

    expect(supabase.rpc).toHaveBeenCalledWith('deposit_funds', {
      p_amount: 50,
      p_payment_ref: 'ref-1',
    })
    expect(wallet.available_balance).toBe(150)
  })

  it('withdrawFunds debits balance via withdraw_funds RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ balance: '70.00', locked_balance: '0.00', available_balance: '70.00' }],
      error: null,
    })

    const wallet = await withdrawFunds(30, 'payout_details')

    expect(supabase.rpc).toHaveBeenCalledWith('withdraw_funds', {
      p_amount: 30,
      p_payout_details: 'payout_details',
    })
    expect(wallet).toEqual({
      balance: 70,
      locked_balance: 0,
      available_balance: 70,
    })
  })

  it('getTransactionHistory fetches user transactions ordered by created_at', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockOrder = vi.fn().mockResolvedValueOnce({
      data: [
        { id: 'tx1', amount: '100.00', type: 'INITIAL_BONUS', status: 'COMPLETED', description: 'Bono', created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    })

    supabase.from.mockReturnValueOnce({ select: mockSelect })
    mockSelect.mockReturnValueOnce({ order: mockOrder })

    const history = await getTransactionHistory()

    expect(supabase.from).toHaveBeenCalledWith('wallet_transactions')
    expect(history).toEqual([
      { id: 'tx1', amount: 100, type: 'INITIAL_BONUS', status: 'COMPLETED', description: 'Bono', created_at: '2026-01-01T00:00:00Z' },
    ])
  })
})
