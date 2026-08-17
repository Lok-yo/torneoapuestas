// Deployed contract addresses (Amoy) + the minimal ABI subset the
// frontend calls. Mirrors contracts/src/MarketFactory.sol and
// contracts/src/ResolutionAdapter.sol's public interface exactly — see
// design.md "Interfaces". Addresses come from build-time env vars,
// populated after `contracts/script/Deploy.s.sol` runs.

export const MARKET_FACTORY_ADDRESS =
  import.meta.env.VITE_MARKET_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000001'
export const RESOLUTION_ADAPTER_ADDRESS =
  import.meta.env.VITE_RESOLUTION_ADAPTER_ADDRESS || '0x0000000000000000000000000000000000000002'
export const USDC_ADDRESS =
  import.meta.env.VITE_USDC_ADDRESS || '0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582'
export const CTF_ADDRESS =
  import.meta.env.VITE_CTF_ADDRESS || '0x2b9c7b95d3f8373bfa59d7249826a79853920c75'

export const MARKET_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'startggEventId', type: 'uint256' },
      { name: 'marketType', type: 'uint8' },
      { name: 'seedLiquidity', type: 'uint256' },
      { name: 'eventStartsAt', type: 'uint256' },
    ],
    outputs: [{ name: 'conditionId', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'challengeCreation',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'questionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'buy',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'investmentAmount', type: 'uint256' },
      { name: 'outcomeIndex', type: 'uint256' },
      { name: 'minOutcomeTokensToBuy', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'sell',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'returnAmount', type: 'uint256' },
      { name: 'outcomeIndex', type: 'uint256' },
      { name: 'maxOutcomeTokensToSell', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'markets',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [
      { name: 'conditionId', type: 'bytes32' },
      { name: 'startggEventId', type: 'uint256' },
      { name: 'marketType', type: 'uint8' },
      { name: 'creator', type: 'address' },
      { name: 'fpmm', type: 'address' },
      { name: 'state', type: 'uint8' },
      { name: 'windowEnds', type: 'uint256' },
      { name: 'creationBond', type: 'uint256' },
      { name: 'challenger', type: 'address' },
      { name: 'challengeBond', type: 'uint256' },
      { name: 'challengedAt', type: 'uint256' },
    ],
  },
  { type: 'function', name: 'CREATION_BOND', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'MIN_LIQUIDITY', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
]

export const RESOLUTION_ADAPTER_ABI = [
  {
    type: 'function',
    name: 'disputeResult',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'questionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settle',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'questionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'redeem',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'indexSets', type: 'uint256[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'resolutions',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [
      { name: 'winningIndex', type: 'uint8' },
      { name: 'resultRef', type: 'bytes32' },
      { name: 'postedAt', type: 'uint256' },
      { name: 'state', type: 'uint8' },
      { name: 'disputer', type: 'address' },
      { name: 'disputeBond', type: 'uint256' },
    ],
  },
]

export const ERC20_ABI = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
]

/** Numeric MarketFactory.MarketState enum values, mirroring
 * contracts/src/MarketFactory.sol exactly. */
export const MARKET_STATE = Object.freeze({
  NONE: 0,
  PENDING: 1,
  CHALLENGED: 2,
  ACTIVE: 3,
  VOID: 4,
})
