// RED (then GREEN against ../featureFlags.js): proves a production build
// hard-forces the demo financial UI flag off regardless of any env
// override — never a silent fixture/demo fallback in production — and
// proves the identity/tournaments/ratings adapter flags are reversibly
// disabled by an explicit env override in *any* environment, including
// production, per legacy-migration-controls spec "Emergency
// disablement". See tasks.md 5.1/5.2/5.3 and legacy-migration-controls
// spec "Explicit source-of-truth boundary" / "Staged, environment-scoped
// rollout".
import { describe, it, expect } from 'vitest'
import { resolveDemoFinancialUIFlag, resolveAdapterFlag, resolveOptInFlag, FEATURE_FLAGS } from '../featureFlags.js'

describe('resolveDemoFinancialUIFlag', () => {
  it('is forced off in a production build even if the env var explicitly requests it on', () => {
    expect(resolveDemoFinancialUIFlag({ isProd: true, envOverride: 'true' })).toBe(false)
  })

  it('is forced off in a production build with no override at all', () => {
    expect(resolveDemoFinancialUIFlag({ isProd: true, envOverride: undefined })).toBe(false)
  })

  it('defaults on in a non-production build with no override', () => {
    expect(resolveDemoFinancialUIFlag({ isProd: false, envOverride: undefined })).toBe(true)
  })

  it('can be explicitly disabled in a non-production build', () => {
    expect(resolveDemoFinancialUIFlag({ isProd: false, envOverride: 'false' })).toBe(false)
  })
})

describe('resolveAdapterFlag', () => {
  it('defaults on with no override', () => {
    expect(resolveAdapterFlag({ envOverride: undefined })).toBe(true)
  })

  it('is reversibly disabled by an explicit "false" override', () => {
    expect(resolveAdapterFlag({ envOverride: 'false' })).toBe(false)
  })

  it('any other value (including "true") leaves it enabled', () => {
    expect(resolveAdapterFlag({ envOverride: 'true' })).toBe(true)
    expect(resolveAdapterFlag({ envOverride: 'nonsense' })).toBe(true)
  })
})

describe('FEATURE_FLAGS', () => {
  it('is frozen (cannot be mutated at runtime)', () => {
    expect(Object.isFrozen(FEATURE_FLAGS)).toBe(true)
  })

  it('defaults identity/tournaments/ratings on when no env override is present', () => {
    expect(FEATURE_FLAGS.identity).toBe(true)
    expect(FEATURE_FLAGS.tournaments).toBe(true)
    expect(FEATURE_FLAGS.ratings).toBe(true)
  })

  it('web3 flag resolves via resolveOptInFlag (default OFF, opt-in via explicit true)', () => {
    expect(resolveOptInFlag({ envOverride: undefined })).toBe(false)
    expect(resolveOptInFlag({ envOverride: 'true' })).toBe(true)
  })
})

// RED (now GREEN against ../featureFlags.js resolveOptInFlag): a THIRD
// flag semantic distinct from resolveAdapterFlag (default ON) and
// resolveDemoFinancialUIFlag (prod hard-OFF) — default OFF everywhere,
// opt-in only via an explicit 'true'. See tasks.md 11.1/13.1 and
// design.md Decision 7.
describe('resolveOptInFlag', () => {
  it('defaults off with no override', () => {
    expect(resolveOptInFlag({ envOverride: undefined })).toBe(false)
  })

  it('defaults off with any non-"true" override, including "false" and garbage values', () => {
    expect(resolveOptInFlag({ envOverride: 'false' })).toBe(false)
    expect(resolveOptInFlag({ envOverride: 'TRUE' })).toBe(false)
    expect(resolveOptInFlag({ envOverride: '1' })).toBe(false)
    expect(resolveOptInFlag({ envOverride: 'nonsense' })).toBe(false)
  })

  it('opts in only via an explicit exact "true" override', () => {
    expect(resolveOptInFlag({ envOverride: 'true' })).toBe(true)
  })

  it('stays off even in a non-production build with no override (unlike resolveDemoFinancialUIFlag)', () => {
    expect(resolveOptInFlag({ envOverride: undefined })).toBe(false)
  })
})
