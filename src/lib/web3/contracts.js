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
export const HOUSE_BANK_ADDRESS =
  import.meta.env.VITE_HOUSE_BANK_ADDRESS || '0x0000000000000000000000000000000000000000'

export const isHouseConfigured = Boolean(
  HOUSE_BANK_ADDRESS && HOUSE_BANK_ADDRESS !== '0x0000000000000000000000000000000000000000',
)

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
  {
    type: 'function',
    name: 'registerStartggEvent',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'startggEventId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'activateIfUnchallenged',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'questionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'knownStartggEvents',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  { type: 'error', name: 'UnknownStartggEvent', inputs: [{ name: 'startggEventId', type: 'uint256' }] },
  { type: 'error', name: 'MarketAlreadyExists', inputs: [{ name: 'questionId', type: 'bytes32' }] },
  {
    type: 'error',
    name: 'InvalidState',
    inputs: [
      { name: 'expected', type: 'uint8' },
      { name: 'actual', type: 'uint8' },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientLiquidity',
    inputs: [
      { name: 'supplied', type: 'uint256' },
      { name: 'minimum', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'Sanctioned', inputs: [{ name: 'who', type: 'address' }] },
  { type: 'error', name: 'ResolutionAdapterUnset', inputs: [] },
  { type: 'error', name: 'NotOwner', inputs: [] },
  { type: 'error', name: 'WindowElapsed', inputs: [{ name: 'windowEnds', type: 'uint256' }] },
  { type: 'error', name: 'WindowNotElapsed', inputs: [{ name: 'windowEnds', type: 'uint256' }] },
  {
    type: 'event',
    name: 'SharesBought',
    inputs: [
      { name: 'questionId', type: 'bytes32', indexed: true },
      { name: 'trader', type: 'address', indexed: true },
      { name: 'outcomeIndex', type: 'uint256', indexed: false },
      { name: 'investmentAmount', type: 'uint256', indexed: false },
      { name: 'outcomeTokens', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MarketActivated',
    inputs: [{ name: 'questionId', type: 'bytes32', indexed: true }],
  },
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
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'error',
    name: 'ERC20InsufficientBalance',
    inputs: [
      { name: 'sender', type: 'address' },
      { name: 'balance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'ERC20InsufficientAllowance',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'allowance', type: 'uint256' },
      { name: 'needed', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'SafeERC20FailedOperation', inputs: [{ name: 'token', type: 'address' }] },
  { type: 'error', name: 'FailedInnerCall', inputs: [] },
  { type: 'error', name: 'AddressEmptyCode', inputs: [{ name: 'target', type: 'address' }] },
]

export const HOUSE_BANK_ABI = [
  {
    type: 'function',
    name: 'addFunds',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'accountId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawProfits',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'accountId', type: 'bytes32' },
    ],
    outputs: [],
  },
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
    outputs: [],
  },
  {
    type: 'function',
    name: 'placeBet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'amount', type: 'uint256' },
      { name: 'outcomeIndex', type: 'uint256' },
      { name: 'accountId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'questionId', type: 'bytes32' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancelBet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'accountId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'maxBetOf',
    stateMutability: 'view',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'outcomeIndex', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'minBetOf',
    stateMutability: 'view',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'outcomeIndex', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'cancelWindowOf',
    stateMutability: 'view',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'wallet', type: 'address' },
      { name: 'accountId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'book',
    stateMutability: 'view',
    inputs: [{ name: 'questionId', type: 'bytes32' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'stake0', type: 'uint256' },
          { name: 'stake1', type: 'uint256' },
          { name: 'odds0', type: 'uint256' },
          { name: 'odds1', type: 'uint256' },
          { name: 'executable', type: 'bool' },
          { name: 'settled', type: 'bool' },
          { name: 'voided', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'userStake',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'bytes32' },
      { name: '', type: 'bytes32' },
      { name: '', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'userLockedPayout',
    stateMutability: 'view',
    inputs: [
      { name: '', type: 'bytes32' },
      { name: '', type: 'bytes32' },
      { name: '', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'positionOf',
    stateMutability: 'view',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'wallet', type: 'address' },
      { name: 'accountId', type: 'bytes32' },
    ],
    outputs: [
      { name: 'stake0', type: 'uint256' },
      { name: 'stake1', type: 'uint256' },
      { name: 'payout0', type: 'uint256' },
      { name: 'payout1', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'pickOf',
    stateMutability: 'view',
    inputs: [
      { name: 'questionId', type: 'bytes32' },
      { name: 'wallet', type: 'address' },
      { name: 'accountId', type: 'bytes32' },
    ],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'accountOf',
    stateMutability: 'view',
    inputs: [
      { name: 'wallet', type: 'address' },
      { name: 'accountId', type: 'bytes32' },
    ],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'balance', type: 'uint256' },
          { name: 'deposited', type: 'uint256' },
          { name: 'inPlay', type: 'uint256' },
          { name: 'withdrawable', type: 'uint256' },
        ],
      },
    ],
  },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'InsufficientBalance', inputs: [] },
  { type: 'error', name: 'ExceedsProfits', inputs: [] },
  { type: 'error', name: 'NotSettled', inputs: [] },
  { type: 'error', name: 'AlreadyClaimed', inputs: [] },
  { type: 'error', name: 'AlreadyOnOtherSide', inputs: [] },
  { type: 'error', name: 'MarketNotOpen', inputs: [] },
  { type: 'error', name: 'InvalidOutcome', inputs: [] },
  { type: 'error', name: 'MissingAccount', inputs: [] },
  { type: 'error', name: 'CancelWindowClosed', inputs: [] },
  { type: 'error', name: 'NoBetToCancel', inputs: [] },
  { type: 'error', name: 'BetTooLarge', inputs: [] },
  { type: 'error', name: 'BetTooSmall', inputs: [] },
  {
    type: 'function',
    name: 'claimed',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'event',
    name: 'FundsAdded',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'accountId', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BetPlaced',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'questionId', type: 'bytes32', indexed: true },
      { name: 'accountId', type: 'bytes32', indexed: true },
      { name: 'outcomeIndex', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BetCancelled',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'questionId', type: 'bytes32', indexed: true },
      { name: 'accountId', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'ProfitsWithdrawn',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'WinningsCredited',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'questionId', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
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
