import { useState, useEffect } from 'react'
import { useParams, Link, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { matchQuestionId } from '../../lib/web3/questionId.js'
import { ArrowLeft } from 'lucide-react'
import { useMarket, useHouseTrade, useHouseAccount, useWalletConnect, useBook } from '../../lib/web3/hooks.js'
import { useSession } from '../../auth/SessionProvider.jsx'
import { MARKET_STATE } from '../../lib/web3/contracts.js'
import { translateError } from '../../lib/web3/translateError.js'
import { formatUsdc, parseUsdc, formatOdds, estimatedPayout, maxBetOnSide, minBetOnSide, OPENING_MAX, openPositionPayout } from '../../lib/web3/format.js'
import { marketStateCopy } from '../../lib/web3/marketLabels.js'
import BetPayoutLines from '../../components/BetPayoutLines.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function OnchainMarketDetailView() {
  const { id: questionId } = useParams()
  const location = useLocation()
  const { status: sessionStatus, profile } = useSession()
  const isAuthed = sessionStatus === 'authenticated' && Boolean(profile?.username)
  const { market, isLoading, error, refetch } = useMarket(questionId)
  const { address, isConnected, connectors, connect, isCorrectChain, switchToAmoy } = useWalletConnect()
  const { placeBet, isPending } = useHouseTrade()
  const { account } = useHouseAccount()
  const { book, userSide, userStake0, userStake1, refetch: refetchBook } = useBook(questionId)

  const [outcomeIndex, setOutcomeIndex] = useState(0)
  const [investAmount, setInvestAmount] = useState('10')
  const [tradeError, setTradeError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [names, setNames] = useState(['Jugador 1', 'Jugador 2'])
  const { t } = useI18n()

  useEffect(() => {
    if (!market?.startggEventId) return
    let active = true
    const findNames = async () => {
      const { data } = await supabase
        .from('public_tournament_sets_view')
        .select('startgg_set_id, entrant_a_name, entrant_b_name')
        .eq('startgg_event_id', market.startggEventId.toString())
      if (!data || !active) return
      for (const s of data) {
        const hash = matchQuestionId(market.startggEventId, s.startgg_set_id)
        if (hash.toLowerCase() === String(questionId).toLowerCase()) {
          setNames([s.entrant_a_name || 'Jugador 1', s.entrant_b_name || 'Jugador 2'])
          break
        }
      }
    }
    findNames()
    return () => {
      active = false
    }
  }, [market?.startggEventId, questionId])

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-zinc-500">{t('market.loading')}</p>
  }

  if (error || !market || market.state === MARKET_STATE.NONE) {
    return (
      <div className="mx-auto max-w-md border border-zinc-800 bg-[#0b0d12] p-6 text-center">
        <p className="text-sm text-zinc-300">{t('market.missing')}</p>
        <Link to="/torneos" className="mt-4 inline-block text-xs font-semibold text-lime hover:underline">
          {t('market.back')}
        </Link>
      </div>
    )
  }

  const copy = marketStateCopy(market.state)
  const pick = names[outcomeIndex]

  const handleBuy = async (e) => {
    e.preventDefault()
    setTradeError(null)
    setNotice(null)
    try {
      if (userSide && userSide !== outcomeIndex + 1) {
        setTradeError(t('market.alreadyOther'))
        return
      }
      const amount = parseUsdc(investAmount)
      const sideStake = outcomeIndex === 0 ? book.stake0 : book.stake1
      const otherStake = outcomeIndex === 0 ? book.stake1 : book.stake0
      const cap = maxBetOnSide(sideStake, otherStake)
      const floor = minBetOnSide(sideStake, otherStake)
      if (amount < floor) {
        setTradeError(t('pred.tooSmall', { amount: formatUsdc(floor) }))
        return
      }
      if (amount > cap) {
        setTradeError(t('pred.tooBig', { amount: formatUsdc(cap) }))
        return
      }
      const est = estimatedPayout(amount, sideStake, otherStake)
      await placeBet({ questionId, investmentAmount: amount, outcomeIndex: BigInt(outcomeIndex) })
      await refetch()
      await refetchBook()
      setNotice(null)
      setReceipt({
        pick,
        stake: formatUsdc(amount),
        profit: est.refund || est.profit <= 0n ? null : formatUsdc(est.profit),
        payout: est.refund || est.profit <= 0n ? null : formatUsdc(amount + est.profit),
      })
    } catch (err) {
      setTradeError(translateError(err) || t('market.txFail'))
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link to="/torneos" className="inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-zinc-200">
        <ArrowLeft size={14} /> {t('market.tournaments')}
      </Link>

      <div>
        <p className="kicker">{t('market.kicker')}</p>
        <h1 className="mt-1 font-display text-5xl uppercase leading-[0.9] text-white">
          {names[0]} <span className="text-zinc-600">vs</span> {names[1]}
        </h1>
        <p className="mt-3 text-[14px] text-zinc-400">{copy.hint}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid sm:grid-cols-2">
          {names.map((name, idx) => {
            const selected = outcomeIndex === idx
            const odds = idx === 0 ? book.odds0 : book.odds1
            const stake = idx === 0 ? book.stake0 : book.stake1
            const pool = book.stake0 + book.stake1
            const pct = pool > 0n ? Number((stake * 100n) / pool) : 50
            const locked = userSide !== 0 && userSide !== idx + 1
            const myStake = idx === 0 ? userStake0 : userStake1
            const otherStake = idx === 0 ? book.stake1 : book.stake0
            const live = openPositionPayout(myStake, stake, otherStake)
            return (
              <button
                key={name}
                type="button"
                disabled={locked}
                onClick={() => setOutcomeIndex(idx)}
                className={`border px-4 py-6 text-left ${
                  locked
                    ? 'cursor-not-allowed border-zinc-900 bg-zinc-950 opacity-50'
                    : selected
                      ? 'border-lime bg-lime/10'
                      : 'border-zinc-800 bg-[#0b0d12] hover:border-zinc-600'
                }`}
              >
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{idx === 0 ? t('market.home') : t('market.away')}</p>
                <p className="mt-1 font-display text-3xl uppercase text-white">{name}</p>
                <p className="mt-2 font-mono text-xl text-lime">{formatOdds(odds) === '—' ? '2.00' : formatOdds(odds)}</p>
                <p className="text-[11px] text-zinc-500">{t('pred.poolPct', { pct })} · {formatUsdc(stake)} USDC</p>
                {myStake > 0n && (
                  <div className="mt-2 text-left">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-lime">{t('pred.yourBet')}</p>
                    <BetPayoutLines stake={myStake} profit={live.profit} pending={live.pending} />
                  </div>
                )}
                {locked && <p className="mt-2 text-[12px] text-zinc-500">{t('market.lockedOther')}</p>}
                {selected && !locked && <p className="mt-2 text-[12px] font-semibold text-lime">{t('market.selected')}</p>}
              </button>
            )
          })}
        </div>

        {market.state !== MARKET_STATE.ACTIVE ? (
          <div className="border border-zinc-800 bg-[#0b0d12] p-5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{copy.label}</p>
            <p className="mt-2 text-[14px] text-zinc-300">{copy.hint}</p>
          </div>
        ) : !isAuthed ? (
          <div className="border border-zinc-800 bg-[#0b0d12] p-5 text-center">
            <p className="text-sm text-zinc-300">{t('market.needAccount')}</p>
            <Link to="/login" state={{ from: location }} className="btn-lime mt-3 inline-block px-4 py-2">
              {t('pred.signInGoogle')}
            </Link>
          </div>
        ) : !isConnected ? (
          <div className="flex flex-col gap-2 border border-zinc-800 bg-[#0b0d12] p-5">
            <p className="text-sm text-zinc-300">{t('market.connectPay')}</p>
            {connectors.map((connector) => (
              <button key={connector.uid} type="button" onClick={() => connect(connector)} className="btn-lime py-2.5">
                {t('wallet.connectWallet', { name: connector.name === 'Injected' ? 'MetaMask' : connector.name })}
              </button>
            ))}
          </div>
        ) : !isCorrectChain ? (
          <button type="button" onClick={switchToAmoy} className="border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-[13px] font-semibold text-amber-300">
            {t('market.switchChain')}
          </button>
        ) : (
          <form onSubmit={handleBuy} className="flex flex-col gap-4 border border-zinc-800 bg-[#0b0d12] p-5">
            <p className="text-[13px] text-zinc-400">{t('market.bettingOn', { pick })}</p>
            {!book.executable && (
              <p className="text-[12px] text-amber-300">{t('pred.openingHint', { amount: formatUsdc(OPENING_MAX) })}</p>
            )}
            <p className="text-[12px] text-zinc-500">
              {t('market.available')} <span className="font-mono text-lime">{formatUsdc(account.balance)} USDC</span>
              {account.balance <= 0n && (
                <>
                  {' · '}
                  <Link to="/wallet" className="font-semibold text-lime hover:underline">
                    {t('market.addFunds')}
                  </Link>
                </>
              )}
            </p>
            <label className="text-[12px] text-zinc-500">
              {t('market.amount')}
              <span className="mt-1 flex items-center border border-zinc-800">
                <input
                  id="invest-amount"
                  type="number"
                  min="1"
                  step="1"
                  value={investAmount}
                  onChange={(e) => setInvestAmount(e.target.value)}
                  className="h-10 w-full bg-transparent px-3 font-mono text-sm text-white outline-none"
                />
                <span className="pr-3 text-[11px] font-bold uppercase tracking-wider text-lime">USDC</span>
              </span>
            </label>
            {(() => {
              const amount = parseUsdc(investAmount)
              const sideStake = outcomeIndex === 0 ? book.stake0 : book.stake1
              const otherStake = outcomeIndex === 0 ? book.stake1 : book.stake0
              const myOpen = outcomeIndex === 0 ? userStake0 : userStake1
              const liveOpen = openPositionPayout(myOpen, sideStake, otherStake)
              const est = estimatedPayout(amount, sideStake, otherStake)
              const cap = maxBetOnSide(sideStake, otherStake)
              const floor = minBetOnSide(sideStake, otherStake)
              if (amount <= 0n && myOpen <= 0n) return null
              return (
                <div className="flex flex-col gap-2">
                  {myOpen > 0n && (
                    <div className="border border-lime/30 bg-lime/5 px-3 py-2 text-[12px] text-zinc-300">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-lime">{t('pred.yourBet')}</p>
                      <div className="mt-1">
                        <BetPayoutLines stake={myOpen} profit={liveOpen.profit} pending={liveOpen.pending} />
                      </div>
                    </div>
                  )}
                {amount > 0n && (
                <div className="border border-zinc-800 px-3 py-2 text-[12px] text-zinc-300">
                  {myOpen > 0n && (
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t('pred.addNow')}</p>
                  )}
                  <BetPayoutLines stake={amount} profit={est.profit} pending={est.refund || est.overLimit || est.underLimit} />
                  <p className="mt-1 text-zinc-500">{t('pred.range', { min: formatUsdc(floor), max: formatUsdc(cap) })}</p>
                  {est.overLimit && <p className="mt-1 text-amber-300">{t('pred.tooBig', { amount: formatUsdc(cap) })}</p>}
                  {est.underLimit && <p className="mt-1 text-amber-300">{t('pred.tooSmall', { amount: formatUsdc(floor) })}</p>}
                </div>
                )}
                </div>
              )
            })()}
            {receipt && (
              <div className="border border-lime/40 bg-lime/10 px-3 py-3" role="status">
                <p className="font-display text-xl uppercase text-lime">{t('market.recorded')}</p>
                <p className="mt-1 text-[13px] text-zinc-200">{t('pred.toPlayer', { stake: receipt.stake, name: receipt.pick })}</p>
                <p className="mt-1 text-lime">
                  {receipt.payout
                    ? t('pred.ifCovered', { payout: receipt.payout, stake: receipt.stake, profit: receipt.profit })
                    : t('pred.waitingOther')}
                </p>
              </div>
            )}
            {tradeError && <p className="text-[13px] text-rose-400">{tradeError}</p>}
            <button
              type="submit"
              disabled={
                isPending ||
                parseUsdc(investAmount) <= 0n ||
                (() => {
                  const sideStake = outcomeIndex === 0 ? book.stake0 : book.stake1
                  const otherStake = outcomeIndex === 0 ? book.stake1 : book.stake0
                  const amt = parseUsdc(investAmount)
                  return amt < minBetOnSide(sideStake, otherStake) || amt > maxBetOnSide(sideStake, otherStake)
                })()
              }
              className="btn-lime py-3 disabled:opacity-50"
            >
              {isPending ? t('market.confirmWallet') : t('market.betCta', { amount: formatUsdc(parseUsdc(investAmount)), pick })}
            </button>
            <p className="font-mono text-[10px] text-zinc-600">{address}</p>
          </form>
        )}
      </div>
    </div>
  )
}
