import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTournaments } from '../useTournaments.js'
import * as repo from '../../repositories/tournamentRepository.js'

vi.mock('../../repositories/tournamentRepository.js', () => ({
  listTournaments: vi.fn(),
  listFinishedTournaments: vi.fn(),
  addTournamentByLink: vi.fn(),
}))

describe('useTournaments hook (30s polling + diff-merge + main/finished shape)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns data in { main, finished } shape and polls every 30s', async () => {
    const initialMain = [{ id: 't1', name: 'Main Tournament V1', status: 'IN_PROGRESS' }]
    const initialFinished = [{ id: 't2', name: 'Finished Tournament', status: 'COMPLETED' }]
    const updatedMain = [{ id: 't1', name: 'Main Tournament V2', status: 'IN_PROGRESS' }]

    repo.listTournaments.mockResolvedValueOnce(initialMain).mockResolvedValueOnce(updatedMain)
    repo.listFinishedTournaments.mockResolvedValue(initialFinished)

    let result
    await act(async () => {
      const rendered = renderHook(() => useTournaments())
      result = rendered.result
    })

    expect(result.current.status).toBe('ready')
    expect(result.current.data).toEqual({
      main: initialMain,
      finished: initialFinished,
    })

    // Advance 30s to fire poll interval
    await act(async () => {
      vi.advanceTimersByTime(30000)
    })

    expect(repo.listTournaments).toHaveBeenCalledTimes(2)
    expect(result.current.data.main[0].name).toBe('Main Tournament V2')
  })

  it('cleans up 30s interval timer on unmount', async () => {
    repo.listTournaments.mockResolvedValue([])
    repo.listFinishedTournaments.mockResolvedValue([])

    let unmount
    await act(async () => {
      const rendered = renderHook(() => useTournaments())
      unmount = rendered.unmount
    })

    expect(repo.listTournaments).toHaveBeenCalledTimes(1)

    unmount()

    await act(async () => {
      vi.advanceTimersByTime(60000)
    })

    // Should not call listTournaments again after unmount
    expect(repo.listTournaments).toHaveBeenCalledTimes(1)
  })
})
