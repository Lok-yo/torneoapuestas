// Minimal Sign-In-With-Ethereum message building + client-side signature
// verification, used only for the OPTIONAL 1:1 GG2<->wallet social link
// (wallet-identity spec "Optional 1:1 SIWE Linking") — never on the
// trading path. Verification happens client-side (viem's `verifyMessage`
// against the wallet's own signature) because only that wallet's private
// key could have produced a signature the connecting library accepts;
// the server-side RPC (link_wallet, see
// src/repositories/walletLinkRepository.js) only needs to enforce the
// 1:1 invariant, not re-verify cryptography.
import { verifyMessage } from 'viem'

export function buildSiweMessage({ address, chainId, nonce, domain = window.location.host, statement = 'Vincular esta wallet a tu cuenta de GG2 (solo para perfil/leaderboard, nunca requerido para operar).' }) {
  return [
    `${domain} quiere que inicies sesión con tu cuenta Ethereum:`,
    address,
    '',
    statement,
    '',
    `URI: ${window.location.origin}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date().toISOString()}`,
  ].join('\n')
}

export function generateNonce() {
  return crypto.randomUUID().replace(/-/g, '')
}

/** @returns {Promise<boolean>} */
export async function verifySiweSignature({ address, message, signature }) {
  return verifyMessage({ address, message, signature })
}
