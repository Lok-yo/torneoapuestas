// Wallet / ledger simulado en TCRED (crédito de prueba). Imita la mecánica de
// mercados de predicción tipo Polymarket (comprar shares SÍ/NO a un precio
// implícito) pero sin mover criptomonedas reales. Persiste en localStorage.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const STARTING_BALANCE = 1000

function sharesPrice(market, side) {
  return side === 'YES' ? market.yesPrice : 1 - market.yesPrice
}

export const useWalletStore = create(
  persist(
    (set, get) => ({
      balance: STARTING_BALANCE,
      positions: [], // { marketId, side, shares, avgPrice }
      transactions: [], // { id, type, marketId, side, amount, shares, price, timestamp }

      /** Compra shares de un lado (YES/NO) de un mercado con `amountTCRED`. */
      buyShares: (market, side, amountTCRED) => {
        const { balance, positions, transactions } = get()
        if (!(amountTCRED > 0) || amountTCRED > balance) {
          return { ok: false, error: 'Monto inválido o saldo insuficiente' }
        }
        const price = sharesPrice(market, side)
        const shares = amountTCRED / price

        const index = positions.findIndex(
          (p) => p.marketId === market.id && p.side === side,
        )
        const nextPositions = [...positions]
        if (index >= 0) {
          const existing = nextPositions[index]
          const totalShares = existing.shares + shares
          const avgPrice =
            (existing.shares * existing.avgPrice + shares * price) / totalShares
          nextPositions[index] = { ...existing, shares: totalShares, avgPrice }
        } else {
          nextPositions.push({ marketId: market.id, side, shares, avgPrice: price })
        }

        set({
          balance: balance - amountTCRED,
          positions: nextPositions,
          transactions: [
            {
              id: `tx-${Date.now()}`,
              type: 'buy',
              marketId: market.id,
              side,
              amount: amountTCRED,
              shares,
              price,
              timestamp: new Date().toISOString(),
            },
            ...transactions,
          ],
        })
        return { ok: true, shares }
      },

      /** Cierra (vende) toda la posición de un lado de un mercado al precio actual. */
      closePosition: (market, side) => {
        const { balance, positions, transactions } = get()
        const index = positions.findIndex((p) => p.marketId === market.id && p.side === side)
        if (index === -1) return { ok: false, error: 'No existe esa posición' }

        const position = positions[index]
        const price = sharesPrice(market, side)
        const proceeds = position.shares * price
        const nextPositions = positions.filter((_, i) => i !== index)

        set({
          balance: balance + proceeds,
          positions: nextPositions,
          transactions: [
            {
              id: `tx-${Date.now()}`,
              type: 'sell',
              marketId: market.id,
              side,
              amount: proceeds,
              shares: position.shares,
              price,
              timestamp: new Date().toISOString(),
            },
            ...transactions,
          ],
        })
        return { ok: true, proceeds }
      },

      resetWallet: () => set({ balance: STARTING_BALANCE, positions: [], transactions: [] }),
    }),
    { name: 'torneoapuestas-wallet' },
  ),
)
