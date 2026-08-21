// Dependency-free mapping helpers shared by BOTH the relayer (Deno, via
// esm.sh) and the local settlement loop (Node, via npm packages) so the
// two runtimes derive the SAME on-chain result mapping from a
// tournament_sets row. Zero imports on purpose — this file is imported
// unmodified from both a Deno Edge Function and a plain Node script. See
// spec "winningIndex Derivation" / "resultRef Derivation" and design.md
// "Data Flow" / "tick core is runtime-agnostic".

/**
 * Derives the on-chain winningIndex (0 or 1) from a tournament_sets row.
 * Index 0 = entrant A, index 1 = entrant B (matches
 * src/lib/web3/marketLabels.js:pickName). Returns null when the winner
 * matches neither entrant (missing/bad data) — callers MUST treat null
 * as an error and never post a guessed result on-chain.
 *
 * @param {{ winner_startgg_id: number|string|null, entrant_a_startgg_id: number|string|null, entrant_b_startgg_id: number|string|null }} set
 * @returns {0|1|null}
 */
export function deriveWinningIndex(set) {
  if (set == null || set.winner_startgg_id == null) return null
  if (set.winner_startgg_id === set.entrant_a_startgg_id) return 0
  if (set.winner_startgg_id === set.entrant_b_startgg_id) return 1
  return null
}

/**
 * Deterministic preimage for a set's on-chain resultRef. The legacy
 * `results.id` UUID no longer exists for bracket sets, so resultRef is
 * derived from `startgg_set_id` instead (spec "resultRef is deterministic
 * per set"). Callers hash this with `keccak256(toBytes(...))` — hashing
 * is deliberately NOT done here so this module stays dependency-free and
 * behaves identically under Deno and Node.
 *
 * @param {number|string} startggSetId
 * @returns {string}
 */
export function resultRefPreimage(startggSetId) {
  return `set:${startggSetId}`
}
