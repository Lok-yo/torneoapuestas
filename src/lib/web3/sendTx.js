import { getAccount, getTransactionCount, waitForTransactionReceipt, getBlockNumber } from 'wagmi/actions'
import { decodeErrorResult, encodeFunctionData } from 'viem'
import { wagmiConfig, AMOY_CHAIN_ID, AMOY_RPC_URL } from './client.js'
import { MARKET_FACTORY_ADDRESS, HOUSE_BANK_ADDRESS, MARKET_FACTORY_ABI, HOUSE_BANK_ABI, ERC20_ABI } from './contracts.js'

const DECODE_ABIS = [...MARKET_FACTORY_ABI, ...HOUSE_BANK_ABI, ...ERC20_ABI]
const CREATE_GAS = 8_000_000n

function collectHexBlobs(value, out = [], depth = 0) {
  if (value == null || depth > 8) return out
  if (typeof value === 'string') {
    const matches = value.match(/0x[0-9a-fA-F]{8,}/g)
    if (matches) out.push(...matches)
    return out
  }
  if (typeof value !== 'object') return out
  if (typeof value.walk === 'function') {
    try {
      collectHexBlobs(value.walk(), out, depth + 1)
    } catch {
      // ignore
    }
  }
  for (const nested of Object.values(value)) collectHexBlobs(nested, out, depth + 1)
  return out
}

export function decodeContractError(err) {
  for (const hex of collectHexBlobs(err)) {
    if (hex.length < 10) continue
    try {
      const decoded = decodeErrorResult({ abi: DECODE_ABIS, data: hex })
      if (decoded?.errorName) return decoded.errorName
    } catch {
      // not a known custom error
    }
  }
  return null
}

export function isNonceError(err) {
  const raw = [
    err?.shortMessage,
    err?.message,
    err?.cause?.shortMessage,
    err?.cause?.message,
    err?.details,
    typeof err?.walk === 'function' ? err.walk()?.message : '',
  ]
    .filter(Boolean)
    .join(' ')
  return /nonce too low|nonce has already been used|replacement transaction underpriced|already known/i.test(raw)
}

function namedError(name, cause) {
  const wrapped = new Error(name)
  wrapped.cause = cause
  return wrapped
}

function hashWasSent(err) {
  return Boolean(err?.hash || err?.transactionHash || err?.cause?.hash)
}

function receiptLooksFailed(err) {
  const msg = String(err?.shortMessage || err?.message || '')
  return /execution reverted|status reverted|Transaction reverted/i.test(msg)
}

async function topUpLocalGas(address) {
  const gasRes = await fetch('/__anvil/gas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  }).catch(() => null)
  if (gasRes && !gasRes.ok) {
    const body = await gasRes.json().catch(() => ({}))
    throw new Error(body.error || 'No se pudo preparar el gas.')
  }
}

async function walletProvider() {
  const { connector } = getAccount(wagmiConfig)
  if (!connector) throw new Error('Conecta la wallet.')
  const provider = await connector.getProvider()
  if (!provider?.request) throw new Error('MetaMask no expuso el provider. Recarga y conecta de nuevo.')
  return provider
}

/** MetaMask can be on chain 80002 via public Amoy while the app talks to Anvil. */
export async function assertWalletSeesContracts() {
  const provider = await walletProvider()
  const [chainId, blockHex, factoryCode, houseCode] = await Promise.all([
    provider.request({ method: 'eth_chainId' }),
    provider.request({ method: 'eth_blockNumber' }),
    provider.request({ method: 'eth_getCode', params: [MARKET_FACTORY_ADDRESS, 'latest'] }),
    provider.request({ method: 'eth_getCode', params: [HOUSE_BANK_ADDRESS, 'latest'] }),
  ])
  if (Number(chainId) !== AMOY_CHAIN_ID) {
    throw new Error('MetaMask no está en la red 80002.')
  }
  if (!factoryCode || factoryCode === '0x' || !houseCode || houseCode === '0x') {
    throw new Error(
      `MetaMask no ve los contratos locales. En MetaMask: Networks → la red 80002 → editar RPC a ${AMOY_RPC_URL}`,
    )
  }
  const mmBlock = Number(blockHex)
  const appBlock = Number(await getBlockNumber(wagmiConfig))
  if (Number.isFinite(mmBlock) && Number.isFinite(appBlock) && Math.abs(mmBlock - appBlock) > 40) {
    throw new Error(
      `MetaMask está en otro nodo (bloque ${mmBlock} vs Anvil ${appBlock}). Pon RPC ${AMOY_RPC_URL}`,
    )
  }
}

async function simulateViaWallet(request, account) {
  const provider = await walletProvider()
  const data = encodeFunctionData({
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
  })
  try {
    await provider.request({
      method: 'eth_call',
      params: [
        {
          from: account,
          to: request.address,
          data,
          gas: `0x${CREATE_GAS.toString(16)}`,
        },
        'latest',
      ],
    })
  } catch (err) {
    const named = decodeContractError(err)
    if (named) throw namedError(named, err)
    const message = err?.data?.message || err?.message || 'eth_call reverted'
    throw namedError(message, err)
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function receiptOk(receipt) {
  const status = receipt?.status
  return status === '0x1' || status === 1 || status === '1'
}

async function mineLocalBlock() {
  await fetch('/__anvil/mine', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  }).catch(() => null)
}

/**
 * Local Anvil + MetaMask: send a legacy tx (gas + gasPrice) so Activity
 * shows Confirmed instead of a signature or a dropped 1559 tx.
 */
export async function sendMetaMaskCall(request, { gas = 2_000_000n, simulate = true } = {}) {
  const { address } = getAccount(wagmiConfig)
  if (!address) throw new Error('Conecta la wallet.')
  await assertWalletSeesContracts()
  await topUpLocalGas(address)

  if (simulate && request.abi && request.functionName) {
    await simulateViaWallet({ ...request, gas }, address)
  }

  const provider = await walletProvider()
  const data = encodeFunctionData({
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
  })
  const hash = await provider.request({
    method: 'eth_sendTransaction',
    params: [
      {
        from: address,
        to: request.address,
        data,
        value: '0x0',
        gas: `0x${gas.toString(16)}`,
        gasPrice: '0x4a817c800',
      },
    ],
  })
  await mineLocalBlock()
  for (let i = 0; i < 40; i++) {
    const receipt = await provider.request({
      method: 'eth_getTransactionReceipt',
      params: [hash],
    })
    if (receipt) {
      if (receiptOk(receipt)) return hash
      const named = decodeContractError(receipt)
      throw namedError(named || 'execution reverted', receipt)
    }
    await sleep(150)
    if (i === 4 || i === 12) await mineLocalBlock()
  }
  throw new Error('No llegó el recibo de MetaMask. La transacción no se confirmó.')
}

/**
 * Sign + send a write. Gas is set high because createMarket deploys an FPMM
 * (~2M gas); MetaMask often underestimates on Anvil and the tx reverts empty.
 */
export async function sendWalletTx(writeContractAsync, request, { retries = 3, simulate = true, gas, wait = true } = {}) {
  const { address } = getAccount(wagmiConfig)
  if (!address) throw new Error('Conecta la wallet.')
  await assertWalletSeesContracts()
  await topUpLocalGas(address)

  const gasLimit = gas ?? (request.functionName === 'createMarket' ? CREATE_GAS : undefined)
  const txRequest = gasLimit ? { ...request, gas: gasLimit } : { ...request }

  if (simulate && request.abi && request.functionName) {
    await simulateViaWallet(txRequest, address)
  }

  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const extra = {}
      if (attempt > 0) {
        extra.nonce = await getTransactionCount(wagmiConfig, { address, blockTag: 'pending' })
      }
      const hash = await writeContractAsync({ ...txRequest, ...extra })
      if (!wait) return hash
      try {
        const receipt = await waitForTransactionReceipt(wagmiConfig, {
          hash,
          confirmations: 1,
        })
        if (receipt.status === 'reverted') {
          throw new Error('execution reverted')
        }
      } catch (waitErr) {
        const msg = String(waitErr?.shortMessage || waitErr?.message || '')
        if (receiptLooksFailed(waitErr) && !msg.includes('could not be found') && !msg.includes('Timed out')) {
          throw waitErr
        }
        return hash
      }
      return hash
    } catch (err) {
      lastErr = err
      if (String(err?.message || '').includes('execution reverted')) throw err
      if (hashWasSent(err)) throw err
      if (attempt < retries && isNonceError(err)) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)))
        continue
      }
      const named = decodeContractError(err)
      if (named) throw namedError(named, err)
      throw err
    }
  }
  const named = decodeContractError(lastErr)
  if (named) throw namedError(named, lastErr)
  throw lastErr
}
