import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { log, newRequestId } from '../log.js'

describe('log', () => {
  let infoSpy
  let errorSpy

  beforeEach(() => {
    infoSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('emits one JSON line with level, timestamp, and provided fields', () => {
    log.info({ requestId: 'req-1', event: 'command.accepted', aggregateId: 'agg-1' })

    expect(infoSpy).toHaveBeenCalledTimes(1)
    const parsed = JSON.parse(infoSpy.mock.calls[0][0])
    expect(parsed.level).toBe('info')
    expect(parsed.requestId).toBe('req-1')
    expect(parsed.event).toBe('command.accepted')
    expect(parsed.aggregateId).toBe('agg-1')
    expect(typeof parsed.timestamp).toBe('string')
  })

  it('redacts denylisted keys instead of logging their raw value', () => {
    log.error({ requestId: 'req-2', event: 'auth.failure', token: 'super-secret-jwt' })

    const parsed = JSON.parse(errorSpy.mock.calls[0][0])
    expect(parsed.token).toBe('[REDACTED]')
    expect(parsed.token).not.toBe('super-secret-jwt')
  })

  it('routes error level to console.error, not console.log', () => {
    log.error({ requestId: 'req-3', event: 'boom' })
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).not.toHaveBeenCalled()
  })
})

describe('newRequestId', () => {
  it('returns a unique string on every call', () => {
    const a = newRequestId()
    const b = newRequestId()
    expect(typeof a).toBe('string')
    expect(a).not.toBe(b)
  })
})
