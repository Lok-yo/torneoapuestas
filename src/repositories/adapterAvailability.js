// Shared assertConfigured() body for every Supabase-backed repository.
// Checks both Supabase configuration (the dependency) and the adapter's
// own reversible flag (the operator control — see
// src/config/featureFlags.js), and records a best-effort migration_events
// audit row identifying which boundary tripped, closing
// legacy-migration-controls spec "Migration audit and rollback evidence".
// See "Explicit source-of-truth boundary" / "Emergency disablement" and
// tasks.md 5.2/5.4.
import { isSupabaseConfigured } from '../lib/supabase.js'
import { AppError } from '../lib/errors.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import { recordMigrationEvent } from './migrationEventRepository.js'

/**
 * @param {'identity'|'tournaments'|'ratings'} adapter
 * @param {string} unavailableMessage - Spanish, user-facing (matches each
 *   repository's existing convention).
 */
export function assertAdapterAvailable(adapter, unavailableMessage) {
  // An operator-disabled flag is checked first: it is a deliberate
  // "Emergency disablement" per the spec, distinct from an unplanned
  // dependency outage, and the audit trail should say which one occurred.
  if (!FEATURE_FLAGS[adapter]) {
    recordMigrationEvent('FLAG_CHANGE', adapter, { reason: 'flag_disabled' })
    throw new AppError('UNAVAILABLE', unavailableMessage)
  }

  if (!isSupabaseConfigured) {
    recordMigrationEvent('ADAPTER_ERROR', adapter, { reason: 'dependency_unavailable' })
    throw new AppError('UNAVAILABLE', unavailableMessage)
  }
}
