// .env.local reader, lifted from the inline parser in
// scripts/verify-onchain.mjs so every local script (settlement-loop,
// dev-fast-forward) shares one implementation. Deliberately dependency-
// free (node:fs only) — no dotenv package. See design.md "File Changes"
// and tasks.md 1.1.

import { readFileSync } from 'node:fs'

/**
 * Reads a `.env.local`-style file and returns its KEY=VALUE pairs as a
 * plain object. Comment lines (`#...`) and blank lines are skipped. Only
 * the first `=` on a line splits key from value, so values containing
 * `=` (URLs, JWTs) are preserved intact. Both key and value are trimmed.
 *
 * @param {URL} [url] defaults to the project root's `.env.local`
 *   (resolved relative to this module, not the caller).
 * @returns {Record<string, string>}
 */
export function loadEnvLocal(url = new URL('../.env.local', import.meta.url)) {
  const raw = readFileSync(url, 'utf8')
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
      }),
  )
}
