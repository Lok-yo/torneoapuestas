import { supabase } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('identity', 'La billetera no está disponible en este momento.')
}

/**
 * Get or initialize the logged-in user's wallet.
 * @returns {Promise<{balance: number, locked_balance: number, available_balance: number, currency: string}>}
 */
export async function getWallet() {
  assertConfigured()
  const { data, error } = await supabase.rpc('get_or_create_wallet')
  if (error) throw toAppError(error)
  const wallet = data?.[0]
  if (!wallet) throw toAppError({ message: 'No se pudo obtener la billetera' })
  return {
    balance: Number(wallet.balance),
    locked_balance: Number(wallet.locked_balance),
    available_balance: Number(wallet.available_balance),
    currency: wallet.currency,
  }
}

/**
 * Deposit funds into user's wallet.
 * @param {number} amount
 * @param {string} paymentRef
 */
export async function depositFunds(amount, paymentRef = 'manual_deposit') {
  assertConfigured()
  const { data, error } = await supabase.rpc('deposit_funds', {
    p_amount: amount,
    p_payment_ref: paymentRef,
  })
  if (error) throw toAppError(error)
  const wallet = data?.[0]
  return {
    balance: Number(wallet.balance),
    locked_balance: Number(wallet.locked_balance),
    available_balance: Number(wallet.available_balance),
  }
}

/**
 * Withdraw funds from user's wallet.
 * @param {number} amount
 * @param {string} payoutDetails
 */
export async function withdrawFunds(amount, payoutDetails = 'manual_withdrawal') {
  assertConfigured()
  const { data, error } = await supabase.rpc('withdraw_funds', {
    p_amount: amount,
    p_payout_details: payoutDetails,
  })
  if (error) throw toAppError(error)
  const wallet = data?.[0]
  return {
    balance: Number(wallet.balance),
    locked_balance: Number(wallet.locked_balance),
    available_balance: Number(wallet.available_balance),
  }
}

/**
 * Fetch wallet transaction ledger history.
 * @returns {Promise<Array<{id: string, amount: number, type: string, status: string, reference_id: string, description: string, created_at: string}>>}
 */
export async function getTransactionHistory() {
  assertConfigured()
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw toAppError(error)
  return (data ?? []).map((tx) => ({
    ...tx,
    amount: Number(tx.amount),
  }))
}
