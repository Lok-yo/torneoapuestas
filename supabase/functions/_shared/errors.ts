// Shared structured-error shape for every Edge Function boundary.
// One machine-readable error envelope, no internal details leaked.
// See design.md "Interfaces / Contracts" and platform-foundation spec
// "Validated commands and structured errors".

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'RATE_LIMITED'
  | 'UNAVAILABLE'

export interface StructuredError {
  error: {
    code: ErrorCode
    message: string
    requestId: string
    retryable: boolean
    details?: unknown
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
}

const RETRYABLE_CODES: ReadonlySet<ErrorCode> = new Set([
  'CONFLICT',
  'RATE_LIMITED',
  'UNAVAILABLE',
])

export class CommandError extends Error {
  readonly code: ErrorCode
  readonly requestId: string
  readonly details?: unknown

  constructor(code: ErrorCode, message: string, requestId: string, details?: unknown) {
    super(message)
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

export function toErrorBody(err: CommandError): StructuredError {
  return {
    error: {
      code: err.code,
      message: err.message,
      requestId: err.requestId,
      retryable: RETRYABLE_CODES.has(err.code),
      details: err.details,
    },
  }
}

export function toHttpResponse(err: CommandError): Response {
  const status = STATUS_BY_CODE[err.code]
  return new Response(JSON.stringify(toErrorBody(err)), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Never expose internal exception details/stack traces to the client.
// Wrap unexpected failures behind a generic 503, keep the original
// message/stack only in server-side logs (see log.ts).
export function toUnexpectedErrorResponse(requestId: string): Response {
  const err = new CommandError('UNAVAILABLE', 'The service is temporarily unavailable.', requestId)
  return toHttpResponse(err)
}
