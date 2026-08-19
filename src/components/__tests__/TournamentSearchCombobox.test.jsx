import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import TournamentSearchCombobox from '../TournamentSearchCombobox.jsx'

vi.mock('../../repositories/tournamentRepository.js', () => ({
  searchTournaments: vi.fn(),
}))

import { searchTournaments } from '../../repositories/tournamentRepository.js'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
  delete Element.prototype.scrollIntoView
})

function renderCombobox(overrides = {}) {
  return render(<TournamentSearchCombobox onSelect={vi.fn()} {...overrides} />)
}

function typeQuery(input, value) {
  fireEvent.change(input, { target: { value } })
}

describe('TournamentSearchCombobox', () => {
  it('debounces the search by 300ms before calling searchTournaments', async () => {
    searchTournaments.mockResolvedValue([])
    renderCombobox()
    const input = screen.getByRole('combobox')

    typeQuery(input, 'melee')

    expect(searchTournaments).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(299) })
    expect(searchTournaments).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(1) })
    expect(searchTournaments).toHaveBeenCalledWith('melee')
  })

  it('cancels stale requests when a new query arrives (race condition)', async () => {
    const resolvers = []
    searchTournaments.mockImplementation(
      () => new Promise((r) => { resolvers.push(r) })
    )
    const onSelect = vi.fn()
    renderCombobox({ onSelect })
    const input = screen.getByRole('combobox')

    typeQuery(input, 'ab')
    act(() => { vi.advanceTimersByTime(300) })
    expect(searchTournaments).toHaveBeenCalledTimes(1)

    typeQuery(input, 'abc')
    act(() => { vi.advanceTimersByTime(300) })
    expect(searchTournaments).toHaveBeenCalledTimes(2)

    resolvers[0]([{ id: '1', name: 'Old', game_id: 'ssbu', startgg_event_id: 1 }])
    await act(async () => {})

    expect(screen.queryByText('Old')).toBeNull()
  })

  it('shows empty-state message when search returns no results', async () => {
    searchTournaments.mockResolvedValue([])
    renderCombobox()
    const input = screen.getByRole('combobox')

    typeQuery(input, 'zzz')
    act(() => { vi.advanceTimersByTime(300) })
    await act(async () => {})

    expect(screen.getByText(/No se encontraron torneos/)).toBeDefined()
  })

  it('navigates results with ArrowDown/ArrowUp and selects with Enter', async () => {
    const tournaments = [
      { id: '1', name: 'Alpha', game_id: 'ssbu', startgg_event_id: 1 },
      { id: '2', name: 'Beta', game_id: 'melee', startgg_event_id: 2 },
    ]
    searchTournaments.mockResolvedValue(tournaments)
    const onSelect = vi.fn()
    renderCombobox({ onSelect })
    const input = screen.getByRole('combobox')

    typeQuery(input, 'test')
    act(() => { vi.advanceTimersByTime(300) })
    await act(async () => {})

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe('tournament-option-0')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBe('tournament-option-1')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.getAttribute('aria-activedescendant')).toBe('tournament-option-0')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith(tournaments[0])
  })

  it('closes dropdown on Escape', async () => {
    searchTournaments.mockResolvedValue([
      { id: '1', name: 'Alpha', game_id: 'ssbu', startgg_event_id: 1 },
    ])
    renderCombobox()
    const input = screen.getByRole('combobox')

    typeQuery(input, 'test')
    act(() => { vi.advanceTimersByTime(300) })
    await act(async () => {})

    expect(screen.getByRole('listbox')).toBeDefined()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
