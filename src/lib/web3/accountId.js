import { keccak256, stringToHex, encodeAbiParameters } from 'viem'

/** Isolates house bankroll + bets per Google user, even on the same wallet. */
export function sessionAccountId(userId) {
  if (!userId) return null
  return keccak256(stringToHex(String(userId)))
}

/** Same key HouseBank uses: keccak256(abi.encode(wallet, accountId)). */
export function housePlayerId(wallet, accountId) {
  if (!wallet || !accountId) return null
  return keccak256(encodeAbiParameters([{ type: 'address' }, { type: 'bytes32' }], [wallet, accountId]))
}
