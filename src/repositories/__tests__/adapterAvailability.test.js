// RED (now GREEN against ../adapterAvailability.js): proves the truthful
// unavailable-state contract legacy-migration-controls requires —
// "Authoritative dependency outage" (dependency down -> truthful
// unavailable, never a silent fixture fallback) and "Emergency
// disablement" (an operator-disabled flag returns to the declared safe
// path, which for these adapters IS the truthful unavailable state,
// since none of them has a fixture counterpart). Also proves the
// "Migration audit and rollback evidence" writer fires for both cases.
// See tasks.md 5.2/5.3/5.4.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { AppError } from '../../lib/errors.js'

const mocks = vi.hoisted(() => ({
  isSupabaseConfigured: true,
  FEATURE_FLAGS: { identity: true, tournaments: true, ratings: true },
  recordMigrationEvent: vi.fn(),
}))

vi.mock('../../lib/supabase.js', () => ({
  get isSupabaseConfigured() {
    return mocks.isSupabaseConfigured
  },
}))
vi.mock('../../config/featureFlags.js', () => ({
  get FEATURE_FLAGS() {
    return mocks.FEATURE_FLAGS
  },
}))
vi.mock('../migrationEventRepository.js', () => ({ recordMigrationEvent: mocks.recordMigrationEvent }))

// Imported after the mocks above are registered.
const { assertAdapterAvailable } = await import('../adapterAvailability.js')

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isSupabaseConfigured = true
  mocks.FEATURE_FLAGS = { identity: true, tournaments: true, ratings: true }
})

describe('assertAdapterAvailable', () => {
  it('does not throw when the adapter is flagged on and the dependency is configured', () => {
    expect(() => assertAdapterAvailable('identity', 'unavailable')).not.toThrow()
    expect(mocks.recordMigrationEvent).not.toHaveBeenCalled()
  })

  it('never falls back to a fixture: a dependency outage throws a truthful UNAVAILABLE error', () => {
    mocks.isSupabaseConfigured = false

    expect(() => assertAdapterAvailable('tournaments', 'El servicio de torneos no está disponible ahora mismo.')).toThrow(
      AppError,
    )
    try {
      assertAdapterAvailable('tournaments', 'El servicio de torneos no está disponible ahora mismo.')
    } catch (err) {
      expect(err.code).toBe('UNAVAILABLE')
    }
  })

  it('records an ADAPTER_ERROR migration event on a dependency outage', () => {
    mocks.isSupabaseConfigured = false

    expect(() => assertAdapterAvailable('ratings', 'unavailable')).toThrow()
    expect(mocks.recordMigrationEvent).toHaveBeenCalledWith('ADAPTER_ERROR', 'ratings', { reason: 'dependency_unavailable' })
  })

  it('an operator-disabled flag returns the same truthful UNAVAILABLE state, not a fixture', () => {
    mocks.FEATURE_FLAGS = { identity: false, tournaments: true, ratings: true }
    mocks.isSupabaseConfigured = true // dependency itself is fine — only the flag is off

    expect(() => assertAdapterAvailable('identity', 'unavailable')).toThrow(AppError)
    try {
      assertAdapterAvailable('identity', 'unavailable')
    } catch (err) {
      expect(err.code).toBe('UNAVAILABLE')
    }
  })

  it('records a FLAG_CHANGE migration event when the adapter flag is disabled', () => {
    mocks.FEATURE_FLAGS = { identity: true, tournaments: false, ratings: true }

    expect(() => assertAdapterAvailable('tournaments', 'unavailable')).toThrow()
    expect(mocks.recordMigrationEvent).toHaveBeenCalledWith('FLAG_CHANGE', 'tournaments', { reason: 'flag_disabled' })
  })

  it('checks the flag before the dependency, so a disabled flag is reported as FLAG_CHANGE even if the dependency is also down', () => {
    mocks.FEATURE_FLAGS = { identity: false, tournaments: true, ratings: true }
    mocks.isSupabaseConfigured = false

    expect(() => assertAdapterAvailable('identity', 'unavailable')).toThrow()
    expect(mocks.recordMigrationEvent).toHaveBeenCalledTimes(1)
    expect(mocks.recordMigrationEvent).toHaveBeenCalledWith('FLAG_CHANGE', 'identity', { reason: 'flag_disabled' })
  })
})
