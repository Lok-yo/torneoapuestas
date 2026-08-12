// RED (now GREEN against ../LoginPage.jsx): proves the post-login return
// destination is allowlisted to a same-origin, in-app relative path —
// never an attacker-forged absolute URL, protocol-relative host, or a
// redirect back into /login (loop). See tasks.md 6.4 and design.md
// threat matrix "Allowlisted same-origin returns prevent loops/open
// redirects".
import { describe, expect, it } from 'vitest'
import { resolveSafeRedirectPath } from '../LoginPage.jsx'

describe('resolveSafeRedirectPath', () => {
  it('allows a plain in-app relative path', () => {
    expect(resolveSafeRedirectPath('/torneos/abc-123')).toBe('/torneos/abc-123')
  })

  it('falls back to "/" when there is no return path at all', () => {
    expect(resolveSafeRedirectPath(undefined)).toBe('/')
    expect(resolveSafeRedirectPath(null)).toBe('/')
    expect(resolveSafeRedirectPath('')).toBe('/')
  })

  it('rejects an absolute forged URL to another origin', () => {
    expect(resolveSafeRedirectPath('https://evil.example.com/phish')).toBe('/')
  })

  it('rejects a protocol-relative host (still cross-origin)', () => {
    expect(resolveSafeRedirectPath('//evil.example.com/phish')).toBe('/')
  })

  it('rejects a non-http(s) scheme smuggled as a path', () => {
    expect(resolveSafeRedirectPath('javascript://evil.example.com/%0aalert(1)')).toBe('/')
  })

  it('rejects a path that is not absolute (would resolve relative to the current route)', () => {
    expect(resolveSafeRedirectPath('torneos/abc-123')).toBe('/')
  })

  it('rejects a redirect back into /login itself to prevent a login loop', () => {
    expect(resolveSafeRedirectPath('/login')).toBe('/')
    expect(resolveSafeRedirectPath('/login/')).toBe('/')
    expect(resolveSafeRedirectPath('/login?next=/wallet')).toBe('/')
  })
})
