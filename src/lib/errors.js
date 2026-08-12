// Client-side counterpart to supabase/functions/_shared/errors.ts.
// Every command boundary (Edge Function or RPC-backed repository call)
// returns/throws this same shape so UI error handling stays uniform.
// See design.md "Interfaces / Contracts".

/**
 * @typedef {'VALIDATION_ERROR'|'UNAUTHENTICATED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'UNPROCESSABLE'|'RATE_LIMITED'|'UNAVAILABLE'} ErrorCode
 */

const RETRYABLE_CODES = new Set(['CONFLICT', 'RATE_LIMITED', 'UNAVAILABLE'])

export class AppError extends Error {
  /**
   * @param {ErrorCode} code
   * @param {string} message
   * @param {{ requestId?: string, details?: unknown }} [options]
   */
  constructor(code, message, { requestId, details } = {}) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.requestId = requestId ?? null
    this.details = details
    this.retryable = RETRYABLE_CODES.has(code)
  }
}

/**
 * Normalizes any thrown value (Supabase error, fetch Response body, raw
 * Error) into an AppError. Never rethrows internal stack traces to the UI.
 * @param {unknown} raw
 * @returns {AppError}
 */
export function toAppError(raw) {
  if (raw instanceof AppError) return raw

  if (raw && typeof raw === 'object' && 'error' in raw) {
    const body = /** @type {{ error?: { code?: string, message?: string, requestId?: string, details?: unknown } }} */ (raw)
    const err = body.error
    if (err && typeof err.code === 'string' && typeof err.message === 'string') {
      return new AppError(/** @type {ErrorCode} */ (err.code), err.message, {
        requestId: err.requestId,
        details: err.details,
      })
    }
  }

  return new AppError('UNAVAILABLE', 'Ocurrió un error inesperado. Intentá de nuevo.', {})
}
