import { describe, it, expect, vi, beforeEach } from 'vitest'
import { supabase } from '../../lib/supabase.js'
import { listTournaments, listFinishedTournaments, addTournamentByLink } from '../tournamentRepository.js'

vi.mock('../../lib/supabase.js', () => {
  const fromMock = vi.fn()
  const invokeMock = vi.fn()
  return {
    isSupabaseConfigured: true,
    supabase: {
      from: fromMock,
      functions: {
        invoke: invokeMock,
      },
    },
  }
})

describe('tournamentRepository (tracked list + add-by-link)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listTournaments queries tracked_tournaments_view filtering by list=main', async () => {
    const mockData = [{ id: 't1', name: 'Main Tournament', list: 'main' }]
    const eqMock = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    supabase.from.mockReturnValue({ select: selectMock })

    const result = await listTournaments()

    expect(supabase.from).toHaveBeenCalledWith('tracked_tournaments_view')
    expect(selectMock).toHaveBeenCalled()
    expect(eqMock).toHaveBeenCalledWith('list', 'main')
    expect(result).toEqual(mockData)
  })

  it('listFinishedTournaments queries tracked_tournaments_view filtering by list=finalizados', async () => {
    const mockData = [{ id: 't2', name: 'Finished Tournament', list: 'finalizados' }]
    const eqMock = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: mockData, error: null }),
    })
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock })
    supabase.from.mockReturnValue({ select: selectMock })

    const result = await listFinishedTournaments()

    expect(supabase.from).toHaveBeenCalledWith('tracked_tournaments_view')
    expect(eqMock).toHaveBeenCalledWith('list', 'finalizados')
    expect(result).toEqual(mockData)
  })

  it('addTournamentByLink invokes startgg-import edge function and returns feedback', async () => {
    supabase.functions.invoke.mockResolvedValue({
      data: { status: 'already_tracked', tournamentId: 't1' },
      error: null,
    })

    const response = await addTournamentByLink('https://start.gg/tournament/smash-open')

    expect(supabase.functions.invoke).toHaveBeenCalledWith('startgg-import', {
      body: { url: 'https://start.gg/tournament/smash-open' },
    })
    expect(response).toEqual({ status: 'already_tracked', tournamentId: 't1' })
  })
})
