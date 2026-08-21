import {
  access,
  chmod,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    default: { ...actual.default, spawn: spawnMock },
    spawn: spawnMock,
  }
})

import {
  main,
  parseDeployAddresses,
  renderPublicManifest,
  renderSettlementManifest,
} from '../demo-bootstrap.mjs'

const forgeOutput = `
== Logs ==
  CTF_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
  USDC_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  FPMM_FACTORY_ADDRESS=0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  MARKET_FACTORY_ADDRESS=0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
  RESOLUTION_ADAPTER_ADDRESS=0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
  HOUSE_BANK_ADDRESS=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
`

const addresses = {
  VITE_CTF_ADDRESS: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
  VITE_USDC_ADDRESS: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  VITE_FPMM_FACTORY_ADDRESS: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  VITE_MARKET_FACTORY_ADDRESS: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
  VITE_RESOLUTION_ADAPTER_ADDRESS: '0x5FC8d32690cc91D4c39d9d3abcBD16989F875707',
  VITE_HOUSE_BANK_ADDRESS: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
}

const runtimeEnv = (stateDir) => ({
  ANVIL_RPC_URL: 'http://anvil.test:8545',
  DEMO_STATE_DIR: stateDir,
})

function createRpc({ chainId = '0x13882', nonce = '0x0', code = '0x60016000' } = {}) {
  return vi.fn(async (_rpcUrl, method, params) => {
    if (method === 'eth_chainId') return chainId
    if (method === 'eth_getTransactionCount') return nonce
    if (method === 'eth_getCode') return typeof code === 'function' ? code(params[0]) : code
    throw new Error(`Unexpected RPC method: ${method}`)
  })
}

async function writeManifestPair(
  stateDir,
  {
    publicContents = renderPublicManifest(addresses),
    settlementContents = renderSettlementManifest(addresses),
    publicMode = 0o644,
    settlementMode = 0o600,
  } = {},
) {
  const publicPath = join(stateDir, 'public.env')
  const settlementPath = join(stateDir, 'settlement.env')
  await writeFile(publicPath, publicContents)
  await writeFile(settlementPath, settlementContents)
  await chmod(publicPath, publicMode)
  await chmod(settlementPath, settlementMode)
}

let stateDir
let rpcMock

beforeEach(async () => {
  stateDir = await mkdtemp(join(tmpdir(), 'gg2-demo-bootstrap-'))
  rpcMock = createRpc()
  spawnMock.mockReset()
})

afterEach(async () => {
  await rm(stateDir, { recursive: true, force: true })
})

describe('demo bootstrap manifests', () => {
  it('extracts every DeployLocal address', () => {
    expect(parseDeployAddresses(forgeOutput)).toMatchObject({
      VITE_MARKET_FACTORY_ADDRESS: '0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9',
      VITE_HOUSE_BANK_ADDRESS: '0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    })
  })

  it('rejects incomplete Forge output', () => {
    expect(() =>
      parseDeployAddresses('USDC_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512'),
    ).toThrow(/missing deployment addresses/i)
  })

  it('rejects duplicate Forge address records', () => {
    expect(() =>
      parseDeployAddresses(
        `${forgeOutput}  CTF_ADDRESS=0x0000000000000000000000000000000000000001\n`,
      ),
    ).toThrow(/duplicate deployment addresses/i)
  })

  it('keeps the public manifest free of the relayer key', () => {
    const addresses = parseDeployAddresses(forgeOutput)
    expect(renderPublicManifest(addresses)).not.toContain('RELAYER_PRIVATE_KEY')
    expect(renderPublicManifest(addresses)).toContain(
      'VITE_HOUSE_BANK_ADDRESS=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853',
    )
    expect(renderSettlementManifest(addresses)).toContain(
      'RELAYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    )
  })
})

describe('worker image', () => {
  it('copies the CA bundle from the digest-pinned Foundry stage', async () => {
    const dockerfile = await readFile(join(process.cwd(), 'Dockerfile'), 'utf8')

    expect(dockerfile).toContain(
      'COPY --from=foundry /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt',
    )
  })
})

describe('demo bootstrap state machine', () => {
  it('uses the contracts-prefixed DeployLocal source with the exact production Forge args', async () => {
    spawnMock.mockImplementation(() => {
      const child = new EventEmitter()
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.stdout.setEncoding = vi.fn()
      child.stderr.setEncoding = vi.fn()
      queueMicrotask(() => {
        child.stdout.emit('data', forgeOutput)
        child.emit('close', 0)
      })
      return child
    })

    await main(runtimeEnv(stateDir), { rpc: rpcMock, logEvent: vi.fn() })

    expect(spawnMock).toHaveBeenCalledWith(
      'forge',
      [
        'script',
        './contracts/script/DeployLocal.s.sol',
        '--root',
        './contracts',
        '--rpc-url',
        'http://anvil:8545',
        '--broadcast',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
  })

  it('rejects a chain other than 80002 before inspecting bootstrap state', async () => {
    rpcMock = createRpc({ chainId: '0x1' })

    await expect(
      main(runtimeEnv(stateDir), { rpc: rpcMock, runForge: vi.fn(), logEvent: vi.fn() }),
    ).rejects.toThrow(/unexpected anvil chain id: 0x1/i)
    expect(rpcMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a partial manifest pair without running Forge', async () => {
    await writeFile(join(stateDir, 'public.env'), renderPublicManifest(addresses))
    const runForge = vi.fn()

    await expect(
      main(runtimeEnv(stateDir), { rpc: rpcMock, runForge, logEvent: vi.fn() }),
    ).rejects.toThrow(/partial bootstrap state/i)
    expect(runForge).not.toHaveBeenCalled()
  })

  it('rejects a nonzero deployer nonce without manifests', async () => {
    rpcMock = createRpc({ nonce: '0x1' })
    const runForge = vi.fn()

    await expect(
      main(runtimeEnv(stateDir), { rpc: rpcMock, runForge, logEvent: vi.fn() }),
    ).rejects.toThrow(/deployer nonce is 0x1 without manifests/i)
    expect(runForge).not.toHaveBeenCalled()
  })

  it('reuses an exact manifest pair without Forge and checks all six contracts', async () => {
    await writeManifestPair(stateDir)
    const runForge = vi.fn()

    await main(runtimeEnv(stateDir), { rpc: rpcMock, runForge, logEvent: vi.fn() })

    expect(runForge).not.toHaveBeenCalled()
    const codeCalls = rpcMock.mock.calls.filter(([, method]) => method === 'eth_getCode')
    expect(codeCalls).toHaveLength(6)
    expect(new Set(codeCalls.map(([, , params]) => params[0])).size).toBe(6)
  })

  it.each([
    {
      name: 'a public manifest with a relayer key',
      manifests: {
        publicContents: `${renderPublicManifest(addresses)}RELAYER_PRIVATE_KEY=exposed\n`,
      },
    },
    {
      name: 'a settlement manifest with an extra key',
      manifests: {
        settlementContents: `${renderSettlementManifest(addresses)}VITE_CTF_ADDRESS=${addresses.VITE_CTF_ADDRESS}\n`,
      },
    },
  ])('rejects $name', async ({ manifests }) => {
    await writeManifestPair(stateDir, manifests)

    await expect(
      main(runtimeEnv(stateDir), { rpc: rpcMock, runForge: vi.fn(), logEvent: vi.fn() }),
    ).rejects.toThrow(/unexpected keys/i)
  })

  it.each([
    { name: 'public.env', publicMode: 0o600, settlementMode: 0o600, expected: '0644' },
    { name: 'settlement.env', publicMode: 0o644, settlementMode: 0o644, expected: '0600' },
  ])('rejects an unsafe or incorrect $name mode', async ({ publicMode, settlementMode, expected }) => {
    await writeManifestPair(stateDir, { publicMode, settlementMode })

    await expect(
      main(runtimeEnv(stateDir), { rpc: rpcMock, runForge: vi.fn(), logEvent: vi.fn() }),
    ).rejects.toThrow(new RegExp(`mode ${expected}`))
  })

  it('publishes exact manifests atomically with required modes after six code checks', async () => {
    const runForge = vi.fn(async () => forgeOutput)

    await main(runtimeEnv(stateDir), { rpc: rpcMock, runForge, logEvent: vi.fn() })

    expect(runForge).toHaveBeenCalledOnce()
    const publicPath = join(stateDir, 'public.env')
    const settlementPath = join(stateDir, 'settlement.env')
    expect(await readFile(publicPath, 'utf8')).toBe(renderPublicManifest(addresses))
    expect(await readFile(settlementPath, 'utf8')).toBe(renderSettlementManifest(addresses))
    await expect(access(`${publicPath}.tmp`)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(`${settlementPath}.tmp`)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await stat(publicPath)).mode & 0o777).toBe(0o644)
    expect((await stat(settlementPath)).mode & 0o777).toBe(0o600)
    const codeCalls = rpcMock.mock.calls.filter(([, method]) => method === 'eth_getCode')
    expect(codeCalls).toHaveLength(6)
  })

  it('does not publish manifests when any of the six contracts has no bytecode', async () => {
    rpcMock = createRpc({
      code: (address) => (address === addresses.VITE_HOUSE_BANK_ADDRESS ? '0x' : '0x60016000'),
    })

    await expect(
      main(runtimeEnv(stateDir), {
        rpc: rpcMock,
        runForge: vi.fn(async () => forgeOutput),
        logEvent: vi.fn(),
      }),
    ).rejects.toThrow(/no deployed bytecode found for VITE_HOUSE_BANK_ADDRESS/i)

    expect(rpcMock.mock.calls.filter(([, method]) => method === 'eth_getCode')).toHaveLength(6)
    await expect(access(join(stateDir, 'public.env'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(access(join(stateDir, 'settlement.env'))).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
