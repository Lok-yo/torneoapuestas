import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData, recoverMessageAddress } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygonAmoy } from 'viem/chains'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadEnvLocal } from './scripts/_env.mjs'
import { isDemoAnvil, resolveInternalRpcUrl } from './src/lib/web3/runtime.js'

const ANVIL_DEPLOYER_ACCOUNT = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'

const FACTORY_ABI = parseAbi([
  'function registerStartggEvent(uint256 startggEventId)',
  'function activateIfUnchallenged(bytes32 questionId)',
])
const HOUSE_ABI = parseAbi([
  'function addFunds(uint256 amount, bytes32 accountId)',
  'function withdrawProfits(uint256 amount, bytes32 accountId)',
  'function createMarket(bytes32 questionId, uint256 startggEventId, uint8 marketType, uint256 seedLiquidity, uint256 eventStartsAt)',
  'function placeBet(bytes32 questionId, uint256 amount, uint256 outcomeIndex, bytes32 accountId)',
  'function cancelBet(bytes32 questionId, bytes32 accountId)',
  'function claim(bytes32 questionId)',
])
const ERC20_ABI = parseAbi([
  'function mint(address to, uint256 amount)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])
const DEAD = '0x000000000000000000000000000000000000dEaD'
const STARTING_USDC = 250n * 1_000_000n
const STARTING_POL_HEX = '0x1bc16d674ec80000' // 2 ETH/POL for gas

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    return {}
  }
}

export function resolveWalletAccount(env, url) {
  // Anvil exposes account 0 through JSON-RPC, so demo helpers never need its
  // published development key in the app process or image.
  if (isDemoAnvil(env, url || resolveInternalRpcUrl(env))) return ANVIL_DEPLOYER_ACCOUNT

  const key = String(env.DEPLOYER_PRIVATE_KEY || '').trim()
  if (!key) throw new Error('DEPLOYER_PRIVATE_KEY is required outside demo Anvil')
  return privateKeyToAccount(key.startsWith('0x') ? key : `0x${key}`)
}

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message || method)
  return data.result
}

function httpError(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

function asBytes32(value, name) {
  const s = String(value || '')
  if (!/^0x[0-9a-fA-F]{64}$/.test(s)) throw httpError(400, `${name} inválido`)
  return s
}

async function requireSignature(body, user) {
  const { message, signature } = body
  if (!message || !signature) throw httpError(400, 'Falta la firma de MetaMask.')
  let recovered
  try {
    recovered = await recoverMessageAddress({ message, signature })
  } catch {
    throw httpError(401, 'Firma ilegible.')
  }
  if (recovered.toLowerCase() !== String(user).toLowerCase()) {
    throw httpError(401, 'La firma no es de esta wallet.')
  }
  const msg = String(message)
  if (!msg.toLowerCase().includes(String(user).toLowerCase())) {
    throw httpError(401, 'El mensaje no corresponde a esta wallet.')
  }
  const nonce = msg.match(/Nonce:\s*(\d+)/)
  if (!nonce || Math.abs(Date.now() - Number(nonce[1])) > 10 * 60 * 1000) {
    throw httpError(401, 'La firma expiró. Confirmá de nuevo.')
  }
  return msg
}

function requireMessageValue(message, label, value) {
  if (value == null || value === '') return
  if (!String(message).includes(String(value))) {
    throw httpError(401, `El mensaje no incluye ${label}.`)
  }
}

async function impersonateSend(url, user, to, data, gas = '0x1e8480') {
  await rpc(url, 'anvil_impersonateAccount', [user])
  await rpc(url, 'anvil_setBalance', [user, STARTING_POL_HEX])
  let txHash
  try {
    txHash = await rpc(url, 'eth_sendTransaction', [{ from: user, to, data, gas }])
  } finally {
    await rpc(url, 'anvil_stopImpersonatingAccount', [user]).catch(() => null)
  }
  let receipt = null
  for (let i = 0; i < 30; i++) {
    receipt = await rpc(url, 'eth_getTransactionReceipt', [txHash])
    if (receipt) break
    await new Promise((r) => setTimeout(r, 100))
  }
  return { txHash, receipt }
}

function clients(env) {
  const url = resolveInternalRpcUrl(env)
  const account = resolveWalletAccount(env, url)
  const transport = http(url)
  return {
    account,
    rpcUrl: url,
    publicClient: createPublicClient({ chain: polygonAmoy, transport }),
    walletClient: createWalletClient({ account, chain: polygonAmoy, transport }),
  }
}

async function handleAnvil(req, res, root) {
  if (req.method !== 'POST') return json(res, 405, { error: 'POST only' })

  const env = loadEnvLocal(pathToFileURL(resolve(root, '.env.local')), process.env)
  const factory = env.VITE_MARKET_FACTORY_ADDRESS
  const usdc = env.VITE_USDC_ADDRESS
  const path = req.url.replace('/__anvil/', '').split('?')[0]

  const body = await readBody(req)
  const { walletClient, publicClient, rpcUrl: url } = clients(env)
  const local = isDemoAnvil(env, url)

  if (path === 'status') {
    const id = await rpc(url, 'eth_chainId', [])
    return json(res, 200, { ok: true, chainId: Number(id), local })
  }

  if (path === 'faucet' || path === 'reset') {
    if (!local) return json(res, 400, { error: 'Faucet only exists on local Anvil, not Amoy.' })
    const address = body.address
    if (!address) return json(res, 400, { error: 'address required' })
    if (usdc) {
      const current = await publicClient.readContract({
        address: usdc,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      })
      if (current > 0n) {
        await rpc(url, 'anvil_impersonateAccount', [address])
        await rpc(url, 'anvil_setBalance', [address, STARTING_POL_HEX])
        const data = encodeFunctionData({
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [DEAD, current],
        })
        await rpc(url, 'eth_sendTransaction', [{ from: address, to: usdc, data }])
        await rpc(url, 'anvil_stopImpersonatingAccount', [address])
      }
      await walletClient.writeContract({
        address: usdc,
        abi: ERC20_ABI,
        functionName: 'mint',
        args: [address, STARTING_USDC],
      })
    }
    await rpc(url, 'anvil_setBalance', [address, STARTING_POL_HEX])
    return json(res, 200, { ok: true, pol: '2', usdc: '250' })
  }

  if (path === 'gas') {
    if (!local) return json(res, 400, { error: 'Gas top-up is local-only.' })
    const address = body.address
    if (!address) return json(res, 400, { error: 'address required' })
    await rpc(url, 'anvil_setBalance', [address, STARTING_POL_HEX])
    return json(res, 200, { ok: true })
  }

  if (path === 'mine') {
    if (!local) return json(res, 400, { error: 'mine is local-only.' })
    await rpc(url, 'evm_mine', [])
    return json(res, 200, { ok: true })
  }

  if (path === 'register') {
    if (!factory) return json(res, 503, { error: 'MARKET_FACTORY not configured' })
    const eventId = BigInt(body.startggEventId)
    await walletClient.writeContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: 'registerStartggEvent',
      args: [eventId],
    })
    return json(res, 200, { ok: true, startggEventId: String(eventId) })
  }

  if (path === 'create-market') {
    if (!local) return json(res, 400, { error: 'create-market is local-only.' })
    const house = env.VITE_HOUSE_BANK_ADDRESS
    if (!factory || !house) return json(res, 503, { error: 'HOUSE/FACTORY not configured' })
    const user = body.address
    const questionId = body.questionId
    if (!user || !questionId) return json(res, 400, { error: 'address and questionId required' })

    const eventId = BigInt(body.startggEventId || 0)
    const marketType = Number(body.marketType || 0)
    const seedLiquidity = BigInt(body.seedLiquidity || 0)
    const eventStartsAt = BigInt(body.eventStartsAt || 0)

    await walletClient.writeContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: 'registerStartggEvent',
      args: [eventId],
    })

    await rpc(url, 'anvil_impersonateAccount', [user])
    await rpc(url, 'anvil_setBalance', [user, STARTING_POL_HEX])
    const data = encodeFunctionData({
      abi: HOUSE_ABI,
      functionName: 'createMarket',
      args: [questionId, eventId, marketType, seedLiquidity, eventStartsAt],
    })
    const txHash = await rpc(url, 'eth_sendTransaction', [
      { from: user, to: house, data, gas: '0x7a1200' },
    ])
    let receipt = null
    for (let i = 0; i < 30; i++) {
      receipt = await rpc(url, 'eth_getTransactionReceipt', [txHash])
      if (receipt) break
      await new Promise((r) => setTimeout(r, 100))
    }
    await rpc(url, 'anvil_stopImpersonatingAccount', [user])
    if (!receipt || receipt.status !== '0x1') {
      return json(res, 500, { error: 'createMarket reverted', txHash, status: receipt?.status || null })
    }

    const nowHex = await rpc(url, 'eth_getBlockByNumber', ['latest', false])
    const current = Number(nowHex?.timestamp || 0)
    await rpc(url, 'evm_setNextBlockTimestamp', [current + 3660])
    await rpc(url, 'evm_mine', [])
    await walletClient.writeContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: 'activateIfUnchallenged',
      args: [questionId],
    })

    return json(res, 200, { ok: true, txHash, questionId })
  }

  if (path === 'add-funds') {
    if (!local) return json(res, 400, { error: 'add-funds is local-only.' })
    const house = env.VITE_HOUSE_BANK_ADDRESS
    const user = body.address
    const amount = BigInt(body.amount || 0)
    if (!house || !user || amount <= 0n) return json(res, 400, { error: 'address and amount required' })
    const accountId = asBytes32(body.accountId, 'accountId')
    const message = await requireSignature(body, user)
    requireMessageValue(message, 'cuenta', accountId)
    requireMessageValue(message, 'monto', String(amount))
    const data = encodeFunctionData({
      abi: HOUSE_ABI,
      functionName: 'addFunds',
      args: [amount, accountId],
    })
    const { txHash, receipt } = await impersonateSend(url, user, house, data)
    if (!receipt || receipt.status !== '0x1') {
      return json(res, 500, { error: 'addFunds reverted', txHash })
    }
    return json(res, 200, { ok: true, txHash })
  }

  if (path === 'withdraw-profits') {
    if (!local) return json(res, 400, { error: 'withdraw-profits is local-only.' })
    const house = env.VITE_HOUSE_BANK_ADDRESS
    const user = body.address
    const amount = BigInt(body.amount || 0)
    if (!house || !user || amount <= 0n) return json(res, 400, { error: 'address and amount required' })
    const accountId = asBytes32(body.accountId, 'accountId')
    const message = await requireSignature(body, user)
    requireMessageValue(message, 'cuenta', accountId)
    requireMessageValue(message, 'monto', String(amount))
    const data = encodeFunctionData({
      abi: HOUSE_ABI,
      functionName: 'withdrawProfits',
      args: [amount, accountId],
    })
    const { txHash, receipt } = await impersonateSend(url, user, house, data)
    if (!receipt || receipt.status !== '0x1') {
      return json(res, 500, { error: 'withdrawProfits reverted', txHash })
    }
    return json(res, 200, { ok: true, txHash })
  }

  if (path === 'place-bet' || path === 'settle') {
    if (!local) return json(res, 400, { error: `${path} is local-only.` })
    const house = env.VITE_HOUSE_BANK_ADDRESS
    if (!house) return json(res, 503, { error: 'HOUSE not configured' })
    const user = body.address
    const questionId = body.questionId
    if (!user || !questionId) return json(res, 400, { error: 'address and questionId required' })
    const message = await requireSignature(body, user)
    requireMessageValue(message, 'mercado', questionId)
    const data =
      path === 'place-bet'
        ? (() => {
            const accountId = asBytes32(body.accountId, 'accountId')
            const amount = BigInt(body.amount || 0)
            requireMessageValue(message, 'cuenta', accountId)
            requireMessageValue(message, 'monto', String(amount))
            return encodeFunctionData({
              abi: HOUSE_ABI,
              functionName: 'placeBet',
              args: [questionId, amount, BigInt(body.outcomeIndex || 0), accountId],
            })
          })()
        : encodeFunctionData({
            abi: HOUSE_ABI,
            functionName: 'claim',
            args: [questionId],
          })
    const { txHash, receipt } = await impersonateSend(url, user, house, data)
    if (!receipt || receipt.status !== '0x1') {
      return json(res, 500, { error: `${path} reverted`, txHash, status: receipt?.status || null })
    }
    return json(res, 200, { ok: true, txHash })
  }

  if (path === 'activate') {
    if (!local) return json(res, 400, { error: 'Time-travel activate is local-only. On Amoy wait the 60 min window.' })
    if (!factory) return json(res, 503, { error: 'MARKET_FACTORY not configured' })
    const questionId = body.questionId
    if (!questionId) return json(res, 400, { error: 'questionId required' })
    const nowHex = await rpc(url, 'eth_getBlockByNumber', ['latest', false])
    const current = Number(nowHex?.timestamp || 0)
    await rpc(url, 'evm_setNextBlockTimestamp', [current + 3660])
    await rpc(url, 'evm_mine', [])
    await walletClient.writeContract({
      address: factory,
      abi: FACTORY_ABI,
      functionName: 'activateIfUnchallenged',
      args: [questionId],
    })
    return json(res, 200, { ok: true, questionId })
  }

  return json(res, 404, { error: 'unknown helper' })
}

export function anvilDevPlugin(root = process.cwd()) {
  return {
    name: 'anvil-dev-helpers',
    configureServer(server) {
      // Must stay synchronous: async Connect middleware swallows WebSocket
      // upgrades (Vite HMR) and surfaces "Connection header did not include 'upgrade'".
      server.middlewares.use((req, res, next) => {
        if (String(req.headers.upgrade || '').toLowerCase() === 'websocket') {
          next()
          return
        }
        if (!req.url?.startsWith('/__anvil/')) {
          next()
          return
        }
        handleAnvil(req, res, root).catch((err) => {
          if (!res.headersSent) json(res, err.status || 500, { error: err?.message || 'anvil helper failed' })
        })
      })
    },
  }
}
