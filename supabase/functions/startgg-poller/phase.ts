// Pure phase-selection + state-mapping logic for startgg-poller, split
// out from index.ts so it can be unit-tested with `deno test` without a
// live start.gg call. See design.md "Poller and Data Flow" and
// bracket-top8-betting tasks.md 2.2.

/** Minimal start.gg phase node shape this module needs. */
export interface StartggPhase {
  id: string
  name: string
}

/** Lowercases, strips diacritics, and collapses whitespace so phase-name
 * matching is robust to "Top 8", "TOP-8", "Top 8 Bracket", "Élimination"
 * etc. (design.md risk 1: inconsistent phase names → normalization). */
export function normalizePhaseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const TOP8_RE = /top[ -]?8/

/** Fallback phase-name tokens, weighted by how specific they are. A name
 * matching several tokens sums the scores ("Top 8 - Finals" → exact
 * top-8 already won, but a plain "Finals Bracket" scores 60). */
const FALLBACK_TOKENS: Array<[RegExp, number]> = [
  [/final/, 40],
  [/elimin/, 30],
  [/bracket/, 20],
  [/playoff/, 10],
]

/**
 * Selects the TOP-8 bracket phase for an event.
 *
 * 1. Exact match first: a normalized name containing `top[ -]?8` wins
 *    ("Top 8", "TOP-8", "Top 8 Bracket").
 * 2. Fallback: phases whose normalized name matches
 *    `final|elimin|bracket|playoff`, scored by specificity. The
 *    round/ID tie-breaks approximate "greatest round, then lowest ID"
 *    from design.md: start.gg phase nodes carry no round field, so the
 *    phase appearing later in the phases list is the deeper bracket
 *    stage, and the lowest id wins an exact tie.
 * 3. No candidate → null; the caller skips the event and logs.
 */
export function pickPhase(phases: StartggPhase[] | null | undefined): StartggPhase | null {
  if (!phases || phases.length === 0) return null

  const normalized = phases.map((phase) => ({ phase, name: normalizePhaseName(phase.name) }))

  const top8 = normalized.find(({ name }) => TOP8_RE.test(name))
  if (top8) return top8.phase

  const candidates = normalized
    .map(({ phase, name }, index) => ({
      phase,
      index,
      score: FALLBACK_TOKENS.reduce((acc, [re, value]) => (re.test(name) ? acc + value : acc), 0),
    }))
    .filter((candidate) => candidate.score > 0)

  if (candidates.length === 0) return null

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.index - a.index ||
      String(a.phase.id).localeCompare(String(b.phase.id), undefined, { numeric: true }),
  )
  return candidates[0].phase
}

/**
 * Maps start.gg's numeric set state to the tournament_sets.state enum
 * (tasks.md 2.2): 3 → COMPLETED, 2 → IN_PROGRESS, anything else →
 * PENDING (future/ready sets are still ingested so the bracket renders
 * before play starts).
 */
export function mapStartggState(state: number): 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' {
  if (state === 3) return 'COMPLETED'
  if (state === 2) return 'IN_PROGRESS'
  return 'PENDING'
}
