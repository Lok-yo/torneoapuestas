// RED (then GREEN against src/domain/tournaments/bracket.js): proves
// bracket generation for an 8-seed single-elimination roster is
// deterministic and never invents winners for later rounds. See tasks.md
// 3.7 and tournament-operations spec "Bracket and match invariants". This
// is the client-testable mirror of the same seeding algorithm the
// generate_bracket RPC (0010_bracket_rpc.sql) applies server-side as the
// real authority, inside one transaction.
import { describe, it, expect } from 'vitest'
import { generateBracketPlan, BracketError } from '../bracket.js'

const SEEDS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8']

describe('bracket generation', () => {
  it('produces the same plan for the same seed order every time (deterministic)', () => {
    const first = generateBracketPlan(SEEDS)
    const second = generateBracketPlan(SEEDS)
    expect(second).toEqual(first)
  })

  it('creates exactly 7 matches for an 8-participant single-elimination bracket', () => {
    const plan = generateBracketPlan(SEEDS)
    expect(plan).toHaveLength(7)
  })

  it('assigns every eligible participant to exactly one first-round match slot', () => {
    const plan = generateBracketPlan(SEEDS)
    const round1 = plan.filter((m) => m.round === 1)
    expect(round1).toHaveLength(4)
    const assigned = round1.flatMap((m) => [m.participantA, m.participantB])
    expect(new Set(assigned)).toEqual(new Set(SEEDS))
    expect(assigned).toHaveLength(SEEDS.length)
  })

  it('never fabricates a winner for round 2+: those slots start with no participants', () => {
    const plan = generateBracketPlan(SEEDS)
    const laterRounds = plan.filter((m) => m.round > 1)
    for (const match of laterRounds) {
      expect(match.participantA).toBeNull()
      expect(match.participantB).toBeNull()
    }
  })

  it('links every match to exactly one next-match slot, except the final', () => {
    const plan = generateBracketPlan(SEEDS)
    const final = plan.find((m) => m.round === 3)
    expect(final.nextMatchSlot).toBeNull()
    const nonFinal = plan.filter((m) => m.round !== 3)
    for (const match of nonFinal) {
      expect(match.nextMatchSlot).toMatch(/^[AB]$/)
      expect(match.nextMatchRound).toBeGreaterThan(match.round)
    }
  })

  it('rejects a roster size other than the approved 8-participant format', () => {
    expect(() => generateBracketPlan(['s1', 's2'])).toThrow(BracketError)
    expect(() => generateBracketPlan([...SEEDS, 's9'])).toThrow(BracketError)
  })
})
