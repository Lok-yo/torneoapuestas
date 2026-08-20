// Client-side counterpart to supabase/functions/_shared/errors.ts.
// Every command boundary (Edge Function or RPC-backed repository call)
// returns/throws this same shape so UI error handling stays uniform.
// See design.md "Interfaces / Contracts".

/**
 * @typedef {'VALIDATION_ERROR'|'UNAUTHENTICATED'|'FORBIDDEN'|'NOT_FOUND'|'CONFLICT'|'UNPROCESSABLE'|'RATE_LIMITED'|'UNAVAILABLE'} ErrorCode
 */

const RETRYABLE_CODES = new Set(['CONFLICT', 'RATE_LIMITED', 'UNAVAILABLE'])

const APP_CODES = new Set([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'UNPROCESSABLE',
  'RATE_LIMITED',
  'UNAVAILABLE',
])

const PREFIX_TO_CODE = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  UNPROCESSABLE: 'UNPROCESSABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  UNAVAILABLE: 'UNAVAILABLE',
  INSUFFICIENT_FUNDS: 'UNPROCESSABLE',
  INVALID_ARGUMENT: 'VALIDATION_ERROR',
  INVALID_STATE: 'UNPROCESSABLE',
}

const CODE_PREFIX = /^(VALIDATION_ERROR|UNAUTHENTICATED|FORBIDDEN|NOT_FOUND|CONFLICT|UNPROCESSABLE|RATE_LIMITED|UNAVAILABLE|INSUFFICIENT_FUNDS|INVALID_ARGUMENT|INVALID_STATE):\s*(.*)$/s

function fromPrefixedMessage(message, extras = {}) {
  if (typeof message !== 'string') return null
  const match = message.match(CODE_PREFIX)
  if (!match) return null
  return new AppError(PREFIX_TO_CODE[match[1]] ?? 'UNAVAILABLE', match[2] || message, extras)
}

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

  if (raw && typeof raw === 'object') {
    if ('error' in raw) {
      const body = /** @type {{ error?: { code?: string, message?: string, requestId?: string, details?: unknown } }} */ (raw)
      const err = body.error
      if (err && typeof err.message === 'string') {
        const prefixed = fromPrefixedMessage(err.message, { requestId: err.requestId, details: err.details })
        if (prefixed) return prefixed
        if (typeof err.code === 'string' && APP_CODES.has(err.code)) {
          return new AppError(/** @type {ErrorCode} */ (err.code), err.message, {
            requestId: err.requestId,
            details: err.details,
          })
        }
      }
    }

    // PostgrestError: { message, code, details, hint }
    if (typeof raw.message === 'string' && raw.message.length > 0) {
      const prefixed = fromPrefixedMessage(raw.message)
      if (prefixed) return prefixed
      if ('code' in raw || 'details' in raw || 'hint' in raw) {
        return new AppError('UNAVAILABLE', raw.message)
      }
    }
  }

  return new AppError('UNAVAILABLE', 'Ocurrió un error inesperado. Intentá de nuevo.', {})
}
