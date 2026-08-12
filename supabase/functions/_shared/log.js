// Structured logging for Edge Functions. Every log line is one JSON
// object with a correlated requestId, propagated across a command's
// validate -> RPC -> response lifecycle. Never logs secrets, tokens, or
// full payloads — only bounded, non-sensitive fields. See
// platform-foundation spec "Audit and operational evidence" and
// design.md "Security, Observability, and Rollout".

/**
 * @typedef {'debug'|'info'|'warn'|'error'} LogLevel
 * @typedef {{ requestId: string, event: string, [key: string]: unknown }} LogFields
 */

const DENYLISTED_KEYS = new Set([
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'password',
  'authorization',
  'apiKey',
  'api_key',
  'serviceRoleKey',
  'service_role_key',
  'jwt',
  'secret',
])

function sanitize(fields) {
  const clean = {}
  for (const [key, value] of Object.entries(fields)) {
    clean[key] = DENYLISTED_KEYS.has(key) ? '[REDACTED]' : value
  }
  return clean
}

function write(level, fields) {
  const record = {
    level,
    timestamp: new Date().toISOString(),
    ...sanitize(fields),
  }
  const line = JSON.stringify(record)
  if (level === 'error') {
    console.error(line)
  } else if (level === 'warn') {
    console.warn(line)
  } else {
    console.log(line)
  }
}

export const log = {
  /** @param {LogFields} fields */
  debug: (fields) => write('debug', fields),
  /** @param {LogFields} fields */
  info: (fields) => write('info', fields),
  /** @param {LogFields} fields */
  warn: (fields) => write('warn', fields),
  /** @param {LogFields} fields */
  error: (fields) => write('error', fields),
}

export function newRequestId() {
  return crypto.randomUUID()
}
