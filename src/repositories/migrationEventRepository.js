// Migration-event repository: the only place that writes to the
// migration_events audit trail (0014_migration_audit.sql), via the
// record_migration_event RPC. See legacy-migration-controls spec
// "Migration audit and rollback evidence" and tasks.md 5.4.
//
// This is a best-effort, fire-and-forget writer by design: recording an
// audit event must never block or fail the primary flow it describes.
// If an adapter is already reporting UNAVAILABLE, a failure to also
// write the audit row must not turn into a second, unrelated error the
// caller has to handle — the missing audit row itself is unusual enough
// to be a Postgres-side observability concern (structured logs on the
// RPC side), not something this SPA can retry indefinitely from the
// browser.
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

/**
 * @typedef {'FLAG_CHANGE'|'ADAPTER_ERROR'|'ROLLBACK'|'RECONCILIATION'} MigrationEventType
 * @typedef {'identity'|'tournaments'|'ratings'|'demoFinancialUI'} MigrationAdapter
 */

/**
 * @param {MigrationEventType} eventType
 * @param {MigrationAdapter} adapter
 * @param {Record<string, unknown>} [detail]
 * @param {string} [requestId] Idempotency key — replays of the same
 *   migration step (retry after interruption) are recorded at most
 *   once server-side (0021_verify_remediation.sql). Generated fresh per
 *   logical step when omitted.
 */
export async function recordMigrationEvent(eventType, adapter, detail = {}, requestId) {
  // No Supabase configuration at all means there is nowhere to write the
  // audit row either — this is the same truthful-unavailable boundary
  // every repository's assertConfigured() already reports; recording a
  // second failure about the failure to record would add noise, not
  // evidence.
  if (!isSupabaseConfigured) return

  try {
    await supabase.rpc('record_migration_event', {
      p_event_type: eventType,
      p_adapter: adapter,
      p_detail: detail,
      p_request_id: requestId ?? crypto.randomUUID(),
    })
  } catch {
    // Best-effort only — never let an audit-write failure surface as a
    // second, unrelated error to the caller. See module doc comment.
  }
}
