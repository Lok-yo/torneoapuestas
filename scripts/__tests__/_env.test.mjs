// RED (Phase 1, task 1.1): scripts/_env.mjs does not exist yet. This
// exercises the KEY=VALUE parser lifted from scripts/verify-onchain.mjs's
// inline .env.local reader (see design.md "File Changes" /
// "scripts/_env.mjs — .env.local reader").

import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEnvLocal } from '../_env.mjs'

function withTempEnvFile(contents, run) {
  const dir = mkdtempSync(join(tmpdir(), 'gg2-env-test-'))
  const file = join(dir, '.env.local')
  writeFileSync(file, contents)
  try {
    return run(pathToFileURL(file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('loadEnvLocal', () => {
  it('parses KEY=VALUE lines, skipping comments and blank lines', () => {
    const env = withTempEnvFile('# a comment\nFOO=bar\n\nBAZ=qux=extra\n', (url) => loadEnvLocal(url, {}))

    expect(env).toEqual({ FOO: 'bar', BAZ: 'qux=extra' })
  })

  it('trims surrounding whitespace from both the key and the value', () => {
    const env = withTempEnvFile('  SPACED  =  value with spaces  \n', (url) => loadEnvLocal(url, {}))

    expect(env).toEqual({ SPACED: 'value with spaces' })
  })

  it('uses runtime variables when the local file is absent', () => {
    const missing = pathToFileURL(join(tmpdir(), 'gg2-env-does-not-exist'))
    expect(loadEnvLocal(missing, { VITE_AMOY_RPC_URL: 'http://anvil:8545' })).toEqual({
      VITE_AMOY_RPC_URL: 'http://anvil:8545',
    })
  })

  it('lets runtime variables override file values', () => {
    const env = withTempEnvFile('RPC=file\nKEEP=file\n', (url) =>
      loadEnvLocal(url, { RPC: 'runtime' }),
    )
    expect(env).toEqual({ RPC: 'runtime', KEEP: 'file' })
  })
})
