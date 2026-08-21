import { spawn } from 'node:child_process'
import { chmod, mkdir, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { loadEnvLocal } from './_env.mjs'

const EXPECTED_CHAIN_ID = '0x13882'
const ANVIL_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const RELAYER_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
const ADDRESS_PATTERN = '0x[0-9a-fA-F]{40}'

const DEPLOYMENT_KEYS = [
  ['CTF_ADDRESS', 'VITE_CTF_ADDRESS'],
  ['USDC_ADDRESS', 'VITE_USDC_ADDRESS'],
  ['FPMM_FACTORY_ADDRESS', 'VITE_FPMM_FACTORY_ADDRESS'],
  ['MARKET_FACTORY_ADDRESS', 'VITE_MARKET_FACTORY_ADDRESS'],
  ['RESOLUTION_ADAPTER_ADDRESS', 'VITE_RESOLUTION_ADAPTER_ADDRESS'],
  ['HOUSE_BANK_ADDRESS', 'VITE_HOUSE_BANK_ADDRESS'],
]

const PUBLIC_KEYS = DEPLOYMENT_KEYS.map(([, publicKey]) => publicKey)
const SETTLEMENT_KEYS = [
  'VITE_RESOLUTION_ADAPTER_ADDRESS',
  'VITE_HOUSE_BANK_ADDRESS',
  'RELAYER_PRIVATE_KEY',
]

function logEvent(event, details = {}) {
  console.log(JSON.stringify({ event, ...details }))
}

function requireAddress(value, key) {
  if (!new RegExp(`^${ADDRESS_PATTERN}$`).test(value ?? '')) {
    throw new Error(`Invalid or missing deployment address: ${key}`)
  }
  return value
}

export function parseDeployAddresses(output) {
  const addresses = {}
  const missing = []
  const duplicates = []

  for (const [forgeKey, publicKey] of DEPLOYMENT_KEYS) {
    const matches = [
      ...output.matchAll(new RegExp(`^[ \\t]*${forgeKey}=(${ADDRESS_PATTERN})\\r?$`, 'gm')),
    ]
    if (matches.length === 0) {
      missing.push(forgeKey)
      continue
    }
    if (matches.length > 1) {
      duplicates.push(forgeKey)
      continue
    }
    addresses[publicKey] = matches[0][1]
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate deployment addresses: ${duplicates.join(', ')}`)
  }
  if (missing.length > 0) {
    throw new Error(`Missing deployment addresses: ${missing.join(', ')}`)
  }

  return addresses
}

export function renderPublicManifest(addresses) {
  return `${PUBLIC_KEYS.map((key) => `${key}=${requireAddress(addresses[key], key)}`).join('\n')}\n`
}

export function renderSettlementManifest(addresses) {
  return [
    `VITE_RESOLUTION_ADAPTER_ADDRESS=${requireAddress(
      addresses.VITE_RESOLUTION_ADAPTER_ADDRESS,
      'VITE_RESOLUTION_ADAPTER_ADDRESS',
    )}`,
    `VITE_HOUSE_BANK_ADDRESS=${requireAddress(
      addresses.VITE_HOUSE_BANK_ADDRESS,
      'VITE_HOUSE_BANK_ADDRESS',
    )}`,
    `RELAYER_PRIVATE_KEY=${RELAYER_PRIVATE_KEY}`,
    '',
  ].join('\n')
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function rpc(rpcUrl, method, params = [], signal) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal,
  })

  if (!response.ok) {
    throw new Error(`Anvil RPC ${method} failed with HTTP ${response.status}`)
  }

  const payload = await response.json()
  if (payload.error || typeof payload.result !== 'string') {
    throw new Error(`Anvil RPC ${method} returned an invalid response`)
  }
  return payload.result
}

async function waitForExpectedChain(rpcUrl, rpcCall, log) {
  const deadline = Date.now() + 60_000
  let attempt = 0
  log('demo-bootstrap.waiting')

  while (Date.now() < deadline) {
    attempt += 1
    const remaining = deadline - Date.now()
    try {
      const chainId = await rpcCall(
        rpcUrl,
        'eth_chainId',
        [],
        AbortSignal.timeout(Math.max(1, Math.min(1_000, remaining))),
      )
      if (chainId.toLowerCase() !== EXPECTED_CHAIN_ID) {
        throw new Error(`Unexpected Anvil chain ID: ${chainId}`)
      }
      return
    } catch (error) {
      if (error.message?.startsWith('Unexpected Anvil chain ID:')) throw error
      if (Date.now() >= deadline) break
      await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, deadline - Date.now())))
    }
  }

  throw new Error(`Anvil was not ready on chain ${EXPECTED_CHAIN_ID} after 60 seconds (${attempt} attempts)`)
}

async function verifyDeployedCode(rpcUrl, addresses, rpcCall) {
  for (const key of PUBLIC_KEYS) {
    const address = requireAddress(addresses[key], key)
    const code = await rpcCall(rpcUrl, 'eth_getCode', [address, 'latest'])
    if (!/^0x[0-9a-fA-F]+$/.test(code) || code === '0x') {
      throw new Error(`No deployed bytecode found for ${key}`)
    }
  }
}

async function runForge() {
  const args = [
    'script',
    './contracts/script/DeployLocal.s.sol',
    '--root',
    './contracts',
    '--rpc-url',
    'http://anvil:8545',
    '--broadcast',
  ]

  return new Promise((resolve, reject) => {
    const child = spawn('forge', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Forge deployment failed with exit code ${code}`))
        return
      }
      resolve(`${stdout}\n${stderr}`)
    })
  })
}

async function writeManifest(path, contents, mode) {
  const temporaryPath = `${path}.tmp`
  await writeFile(temporaryPath, contents, { encoding: 'utf8', mode })
  await chmod(temporaryPath, mode)
  await rename(temporaryPath, path)
}

async function loadManifest(path, expectedKeys, expectedMode, name) {
  const manifest = loadEnvLocal(pathToFileURL(path), {})
  const actualKeys = Object.keys(manifest)
  const missingKeys = expectedKeys.filter((key) => !actualKeys.includes(key))
  const unexpectedKeys = actualKeys.filter((key) => !expectedKeys.includes(key))

  if (missingKeys.length > 0) {
    throw new Error(`Missing keys in ${name}: ${missingKeys.join(', ')}`)
  }
  if (unexpectedKeys.length > 0) {
    throw new Error(`Unexpected keys in ${name}: ${unexpectedKeys.join(', ')}`)
  }

  const actualMode = (await stat(path)).mode & 0o777
  if (actualMode !== expectedMode) {
    throw new Error(
      `${name} must have mode ${expectedMode.toString(8).padStart(4, '0')}; got ${actualMode
        .toString(8)
        .padStart(4, '0')}`,
    )
  }

  return manifest
}

async function loadExistingAddresses(publicPath, settlementPath) {
  const publicEnv = await loadManifest(publicPath, PUBLIC_KEYS, 0o644, 'public.env')
  const settlementEnv = await loadManifest(
    settlementPath,
    SETTLEMENT_KEYS,
    0o600,
    'settlement.env',
  )
  const addresses = Object.fromEntries(
    PUBLIC_KEYS.map((key) => [key, requireAddress(publicEnv[key], key)]),
  )

  if (
    settlementEnv.VITE_RESOLUTION_ADAPTER_ADDRESS !== addresses.VITE_RESOLUTION_ADAPTER_ADDRESS ||
    settlementEnv.VITE_HOUSE_BANK_ADDRESS !== addresses.VITE_HOUSE_BANK_ADDRESS ||
    settlementEnv.RELAYER_PRIVATE_KEY !== RELAYER_PRIVATE_KEY
  ) {
    throw new Error('Settlement manifest does not match the public deployment manifest')
  }

  return addresses
}

export async function main(runtimeEnv = process.env, dependencies = {}) {
  const rpcCall = dependencies.rpc ?? rpc
  const deploy = dependencies.runForge ?? runForge
  const log = dependencies.logEvent ?? logEvent
  const rpcUrl = runtimeEnv.ANVIL_RPC_URL
  const stateDir = runtimeEnv.DEMO_STATE_DIR
  if (!rpcUrl) throw new Error('ANVIL_RPC_URL is required')
  if (!stateDir) throw new Error('DEMO_STATE_DIR is required')

  await waitForExpectedChain(rpcUrl, rpcCall, log)
  await mkdir(stateDir, { recursive: true, mode: 0o700 })

  const publicPath = join(stateDir, 'public.env')
  const settlementPath = join(stateDir, 'settlement.env')
  const [hasPublicManifest, hasSettlementManifest] = await Promise.all([
    pathExists(publicPath),
    pathExists(settlementPath),
  ])

  if (hasPublicManifest !== hasSettlementManifest) {
    throw new Error('Partial bootstrap state: exactly one deployment manifest exists')
  }

  if (hasPublicManifest) {
    const addresses = await loadExistingAddresses(publicPath, settlementPath)
    await verifyDeployedCode(rpcUrl, addresses, rpcCall)
    log('demo-bootstrap.reused')
    return
  }

  const nonce = await rpcCall(rpcUrl, 'eth_getTransactionCount', [ANVIL_ACCOUNT, 'latest'])
  if (nonce.toLowerCase() !== '0x0') {
    throw new Error(`Partial bootstrap state: deployer nonce is ${nonce} without manifests`)
  }

  const forgeOutput = await deploy()
  const addresses = parseDeployAddresses(forgeOutput)
  await verifyDeployedCode(rpcUrl, addresses, rpcCall)

  await writeManifest(publicPath, renderPublicManifest(addresses), 0o644)
  await writeManifest(settlementPath, renderSettlementManifest(addresses), 0o600)
  log('demo-bootstrap.deployed')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    logEvent('demo-bootstrap.failed', { message: error.message })
    process.exitCode = 1
  })
}
