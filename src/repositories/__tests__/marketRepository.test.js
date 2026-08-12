import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listMarkets, createPredictionMarket, buyMarketShares, resolveMarket } from '../marketRepository.js'
import { supabase } from '../../lib/supabase.js'

vi.mock('../../lib/supabase.js', () => ({
  isSupabaseConfigured: true,
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}))

describe('marketRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listMarkets queries markets with market_outcomes', async () => {
    const mockSelect = vi.fn().mockReturnThis()
    const mockOrder = vi.fn().mockResolvedValueOnce({
      data: [{ id: 'm1', question: '¿Gana P1?', market_outcomes: [{ id: 'o1', label: 'Sí' }] }],
      error: null,
    })

    supabase.from.mockReturnValueOnce({ select: mockSelect })
    mockSelect.mockReturnValueOnce({ order: mockOrder })

    const markets = await listMarkets()

    expect(supabase.from).toHaveBeenCalledWith('markets')
    expect(markets).toHaveLength(1)
    expect(markets[0].question).toBe('¿Gana P1?')
  })

  it('createPredictionMarket calls create_prediction_market RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ market_id: 'm1', question: '¿Gana P1?', status: 'OPEN' }],
      error: null,
    })

    const res = await createPredictionMarket('t1', '¿Gana P1?')

    expect(supabase.rpc).toHaveBeenCalledWith('create_prediction_market', {
      p_tournament_id: 't1',
      p_question: '¿Gana P1?',
      p_category: 'TOURNAMENT',
    })
    expect(res.status).toBe('OPEN')
  })

  it('buyMarketShares calls buy_market_shares RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ position_id: 'pos1', total_shares: 10, total_cost: 5, new_available_balance: 95 }],
      error: null,
    })

    const res = await buyMarketShares('m1', 'o1', 10)

    expect(supabase.rpc).toHaveBeenCalledWith('buy_market_shares', {
      p_market_id: 'm1',
      p_outcome_id: 'o1',
      p_shares: 10,
    })
    expect(res.total_cost).toBe(5)
  })

  it('resolveMarket calls resolve_market RPC', async () => {
    supabase.rpc.mockResolvedValueOnce({
      data: [{ market_id: 'm1', status: 'RESOLVED', total_payout: 10 }],
      error: null,
    })

    const res = await resolveMarket('m1', 'o1')

    expect(supabase.rpc).toHaveBeenCalledWith('resolve_market', {
      p_market_id: 'm1',
      p_winning_outcome_id: 'o1',
    })
    expect(res.status).toBe('RESOLVED')
  })
})
