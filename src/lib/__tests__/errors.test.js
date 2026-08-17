import { describe, expect, it } from 'vitest'
import { AppError, toAppError } from '../errors.js'

describe('toAppError', () => {
  it('passes an existing AppError through unchanged', () => {
    const original = new AppError('CONFLICT', 'stale version', { requestId: 'req-1' })
    expect(toAppError(original)).toBe(original)
  })

  it('normalizes a structured { error } body into an AppError', () => {
    const result = toAppError({
      error: { code: 'FORBIDDEN', message: 'Not your tournament', requestId: 'req-2', details: { role: 'user' } },
    })

    expect(result).toBeInstanceOf(AppError)
    expect(result.code).toBe('FORBIDDEN')
    expect(result.message).toBe('Not your tournament')
    expect(result.requestId).toBe('req-2')
    expect(result.details).toEqual({ role: 'user' })
  })

  it('marks retryable codes as retryable', () => {
    expect(toAppError({ error: { code: 'RATE_LIMITED', message: 'slow down' } }).retryable).toBe(true)
    expect(toAppError({ error: { code: 'CONFLICT', message: 'conflict' } }).retryable).toBe(true)
    expect(toAppError({ error: { code: 'UNAVAILABLE', message: 'down' } }).retryable).toBe(true)
  })

  it('marks non-retryable codes as not retryable', () => {
    expect(toAppError({ error: { code: 'VALIDATION_ERROR', message: 'bad input' } }).retryable).toBe(false)
    expect(toAppError({ error: { code: 'FORBIDDEN', message: 'denied' } }).retryable).toBe(false)
  })

  it('falls back to a generic UNAVAILABLE error for unrecognized shapes', () => {
    const result = toAppError(new Error('boom'))
    expect(result).toBeInstanceOf(AppError)
    expect(result.code).toBe('UNAVAILABLE')
  })

  it('falls back to a generic UNAVAILABLE error for null/undefined', () => {
    expect(toAppError(null).code).toBe('UNAVAILABLE')
    expect(toAppError(undefined).code).toBe('UNAVAILABLE')
  })
})
