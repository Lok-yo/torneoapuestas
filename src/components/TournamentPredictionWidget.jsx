import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { createPublicClient, http } from 'viem'
import { polygonAmoy } from 'viem/chains'
import { useSession } from '../auth/SessionProvider.jsx'
import { sessionAccountId } from '../lib/web3/accountId.js'
import { useWalletConnect, useHouseTrade, useHouseAccount } from '../lib/web3/hooks.js'
import { MARKET_FACTORY_ABI, MARKET_FACTORY_ADDRESS, MARKET_STATE, HOUSE_BANK_ABI, HOUSE_BANK_ADDRESS } from '../lib/web3/contracts.js'
import { matchQuestionId } from '../lib/web3/questionId.js'
import { parseUsdc, formatUsdc, formatOdds, estimatedPayout, maxBetOnSide, minBetOnSide, OPENING_MAX, lockedPositionPayout } from '../lib/web3/format.js'
import { translateError } from '../lib/web3/translateError.js'
import { marketStateCopy } from '../lib/web3/marketLabels.js'
import { roundLabel } from '../lib/bets.js'
import CreateMarketModal from './CreateMarketModal.jsx'
import BetPayoutLines from './BetPayoutLines.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function TournamentPredictionWidget({ tournamentId, sets = [], startggEventId }) {
  const location = useLocation()
  const { status: sessionStatus, profile, session } = useSession()
  const accountId = sessionAccountId(session?.user?.id)
  const isAuthed = sessionStatus === 'authenticated' && Boolean(profile?.username)
  const { address, isConnected, connectors, connect, isCorrectChain, switchToAmoy } = useWalletConnect()
  const { placeBet, isPending } = useHouseTrade()
  const { account, refetch: refetchHouse } = useHouseAccount()
  const [receipt, setReceipt] = useState(null)

  const [markets, setMarkets] = useState({})
  const [selectedSet, setSelectedSet] = useState(null)
  const [stake, setStake] = useState('10')
  
  const [actionError, setActionError] = useState(null)
  const { t } = useI18n()

  const lines = useMemo(
    () => (sets ?? []).filter((s) => s.entrant_a_name && s.entrant_b_name),
    [sets],
  )

  const refreshMarkets = async () => {
    if (!MARKET_FACTORY_ADDRESS || lines.length === 0) {
      setMarkets({})
      return
    }
    const client = createPublicClient({
      chain: polygonAmoy,
      transport: http(import.meta.env.VITE_AMOY_RPC_URL || undefined),
    })
    const next = {}
    await Promise.all(
      lines.map(async (s) => {
        const questionId = matchQuestionId(s.startgg_event_id || startggEventId, s.startgg_set_id)
        try {
          const data = await client.readContract({
            address: MARKET_FACTORY_ADDRESS,
            abi: MARKET_FACTORY_ABI,
            functionName: 'markets',
            args: [questionId],
          })
          const state = Number(data[5])
          let book = null
          let userSide = 0
          let userStake0 = 0n
          let userStake1 = 0n
          let userPayout0 = 0n
          let userPayout1 = 0n
          if (HOUSE_BANK_ADDRESS && state === MARKET_STATE.ACTIVE) {
            try {
              book = await client.readContract({
                address: HOUSE_BANK_ADDRESS,
                abi: HOUSE_BANK_ABI,
                functionName: 'book',
                args: [questionId],
              })
              if (address && accountId) {
                userSide = Number(
                  await client.readContract({
                    address: HOUSE_BANK_ADDRESS,
                    abi: HOUSE_BANK_ABI,
                    functionName: 'pickOf',
                    args: [questionId, address, accountId],
                  }),
                )
                const row = await client.readContract({
                  address: HOUSE_BANK_ADDRESS,
                  abi: HOUSE_BANK_ABI,
                  functionName: 'positionOf',
                  args: [questionId, address, accountId],
                })
                const pos = Array.isArray(row) ? row : [row.stake0, row.stake1, row.payout0, row.payout1]
                userStake0 = pos[0] ?? 0n
                userStake1 = pos[1] ?? 0n
                userPayout0 = pos[2] ?? 0n
                userPayout1 = pos[3] ?? 0n
              }
            } catch {
              book = null
            }
          }
          next[s.startgg_set_id] = { questionId, state, book, userSide, userStake0, userStake1, userPayout0, userPayout1 }
        } catch {
          next[s.startgg_set_id] = { questionId, state: 0 }
        }
      }),
    )
    setMarkets(next)
  }

  useEffect(() => {
    refreshMarkets()
    const id = setInterval(refreshMarkets, 4000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines.map((s) => s.startgg_set_id).join(','), startggEventId, address, accountId])

  const handleBet = async (line, outcomeIndex) => {
    setActionError(null)
    const info = markets[line.startgg_set_id]
    if (!info || info.state !== MARKET_STATE.ACTIVE) {
      setActionError(t('pred.lineClosed'))
      return
    }
    if (info.userSide && info.userSide !== outcomeIndex + 1) {
      setActionError(t('pred.alreadyOther'))
      return
    }
    const name = outcomeIndex === 0 ? line.entrant_a_name : line.entrant_b_name
    const amount = parseUsdc(stake)
    const book = info.book
    const sideStake = (outcomeIndex === 0 ? book?.stake0 ?? book?.[0] : book?.stake1 ?? book?.[1]) ?? 0n
    const otherStake = (outcomeIndex === 0 ? book?.stake1 ?? book?.[1] : book?.stake0 ?? book?.[0]) ?? 0n
    const cap = maxBetOnSide(sideStake, otherStake)
    const floor = minBetOnSide(sideStake, otherStake)
    if (amount < floor) {
      setActionError(t('pred.tooSmall', { amount: formatUsdc(floor) }))
      return
    }
    if (amount > cap) {
      setActionError(t('pred.tooBig', { amount: formatUsdc(cap) }))
      return
    }
    const est = estimatedPayout(amount, sideStake, otherStake)
    try {
      await placeBet({
        questionId: info.questionId,
        investmentAmount: amount,
        outcomeIndex: BigInt(outcomeIndex),
      })
      await refreshMarkets()
      await refetchHouse()
      setReceipt({
        name,
        stake: formatUsdc(amount),
        profit: est.refund || est.profit <= 0n ? null : formatUsdc(est.profit),
        payout: est.refund || est.profit <= 0n ? null : formatUsdc(amount + est.profit),
        refund: est.refund || otherStake === 0n,
      })
    } catch (err) {
      setActionError(translateError(err) || t('pred.txFail'))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="kicker">{t('pred.kicker')}</p>
        <h2 className="mt-1 font-display text-3xl uppercase text-white">{t('pred.title')}</h2>
        <p className="mt-1 max-w-xl text-[14px] text-zinc-400">{t('pred.intro')}</p>
      </div>

      {!isAuthed && (
        <div className="border border-zinc-800 bg-[#0b0d12] px-4 py-3 text-[14px] text-zinc-300">
          {t('pred.needAccount')}{' '}
          <Link to="/login" state={{ from: location }} className="font-semibold text-lime hover:underline">
            {t('pred.signInGoogle')}
          </Link>
        </div>
      )}

      {isAuthed && !isConnected && (
        <div className="flex flex-col gap-2 border border-zinc-800 bg-[#0b0d12] p-4">
          <p className="text-[14px] text-zinc-300">{t('pred.connectMm')}</p>
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              onClick={() => connect(connector)}
              className="btn-lime py-2.5"
            >
              {t('wallet.connectWallet', { name: connector.name === 'Injected' ? 'MetaMask' : connector.name })}
            </button>
          ))}
        </div>
      )}

      {isAuthed && isConnected && !isCorrectChain && (
        <button type="button" onClick={switchToAmoy} className="border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-left text-[13px] font-semibold text-amber-300">
          {t('pred.switchChain')}
        </button>
      )}

      {receipt && (
        <div className="border border-lime/40 bg-lime/10 px-4 py-4 text-[13px] text-zinc-200" role="status">
          <p className="font-display text-2xl uppercase text-lime">{t('pred.recorded')}</p>
          <p className="mt-1">{t('pred.toPlayer', { stake: receipt.stake, name: receipt.name })}</p>
          <p className="mt-1 text-lime">
            {receipt.payout
              ? t('pred.ifCovered', { payout: receipt.payout, stake: receipt.stake, profit: receipt.profit })
              : t('pred.waitingOther')}
          </p>
        </div>
      )}
      {actionError && <p className="border border-rose-500/20 bg-rose-950/20 px-4 py-2 text-[13px] text-rose-400">{actionError}</p>}

      {isAuthed && isConnected && (
        <label className="flex flex-wrap items-center gap-3 text-[13px] text-zinc-400">
          {t('pred.stakeLabel')}
          <span className="inline-flex items-center border border-zinc-800 bg-zinc-950">
            <input
              type="number"
              min="1"
              step="1"
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              className="h-9 w-20 bg-transparent px-3 font-mono text-[13px] text-white outline-none"
            />
            <span className="pr-3 text-[11px] font-bold uppercase tracking-wider text-lime">USDC</span>
          </span>
          <span className="text-[12px] text-zinc-500">
            {t('pred.houseBal', { amount: formatUsdc(account.balance) })}
            {account.balance <= 0n && (
              <>
                {' · '}
                <Link to="/wallet" className="font-semibold text-lime hover:underline">
                  {t('pred.addFunds')}
                </Link>
              </>
            )}
          </span>
        </label>
      )}

      {lines.length === 0 ? (
        <p className="border border-zinc-800 px-4 py-8 text-center text-sm text-zinc-500">{t('pred.noSets')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {lines.map((line) => {
            const info = markets[line.startgg_set_id]
            const copy = marketStateCopy(info?.state ?? 0)
            const open = info?.state === MARKET_STATE.ACTIVE
            const canOpen = isAuthed && isConnected && (!info || info.state === MARKET_STATE.NONE) && line.state !== 'COMPLETED'
            return (
              <article key={line.startgg_set_id} className="border border-zinc-800 bg-[#0b0d12]">
                <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">
                      {roundLabel(line.round)}
                      {line.phase_name ? ` · ${line.phase_name}` : ''}
                    </p>
                    <h3 className="mt-0.5 font-display text-2xl uppercase leading-none text-white">
                      {line.entrant_a_name} <span className="text-zinc-600">vs</span> {line.entrant_b_name}
                    </h3>
                  </div>
                  <span className={`shrink-0 px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${
                    open ? 'bg-lime text-[#0a0c08]' : 'border border-zinc-700 text-zinc-400'
                  }`}>
                    {copy.label}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2">
                  {[line.entrant_a_name, line.entrant_b_name].map((name, idx) => {
                    const book = info?.book
                    const stake0 = book?.stake0 ?? book?.[0] ?? 0n
                    const stake1 = book?.stake1 ?? book?.[1] ?? 0n
                    const odds0 = book?.odds0 ?? book?.[2] ?? 0n
                    const odds1 = book?.odds1 ?? book?.[3] ?? 0n
                    const executable = Boolean(book?.executable ?? book?.[4])
                    const sideStake = idx === 0 ? stake0 : stake1
                    const otherStake = idx === 0 ? stake1 : stake0
                    const odds = idx === 0 ? odds0 : odds1
                    const pool = stake0 + stake1
                    const pct = pool > 0n ? Number((sideStake * 100n) / pool) : 50
                    const locked = Boolean(info?.userSide) && info.userSide !== idx + 1
                    const mine = info?.userSide === idx + 1
                    const myStake = idx === 0 ? info?.userStake0 ?? 0n : info?.userStake1 ?? 0n
                    const myPayout = idx === 0 ? info?.userPayout0 ?? 0n : info?.userPayout1 ?? 0n
                    const live = lockedPositionPayout(myStake, myPayout)
                    return (
                      <div key={`${line.startgg_set_id}-${idx}`} className={`flex flex-col gap-3 p-4 ${idx === 0 ? 'sm:border-r sm:border-zinc-800' : ''}`}>
                        <p className="text-[15px] font-semibold text-white">{name}</p>
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t('pred.odds')}</p>
                            <p className="font-mono text-2xl text-lime" title={t('pred.oddsTooltip')}>{formatOdds(odds || 0n) === '—' ? 'x2.00' : formatOdds(odds)}</p>
                          </div>
                          <p className="text-right text-[11px] text-zinc-500">
                            {t('pred.poolPct', { pct })}
                            <br />
                            {formatUsdc(sideStake)} USDC
                          </p>
                        </div>
                        <div className="h-1.5 overflow-hidden bg-zinc-800">
                          <div className="h-full bg-lime" style={{ width: `${pct}%` }} />
                        </div>
                        {mine && myStake > 0n && (
                          <div className="border border-lime/30 bg-lime/5 px-3 py-2">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-lime">{t('pred.yourBet')}</p>
                            <div className="mt-1">
                              <BetPayoutLines stake={myStake} profit={live.profit} pending={live.pending} />
                            </div>
                          </div>
                        )}
                        {open && isAuthed && isConnected ? (
                          locked ? (
                            <p className="text-[12px] text-zinc-500">{t('pred.otherSideLocked')}</p>
                          ) : (
                            (() => {
                              const amt = parseUsdc(stake)
                              const est = estimatedPayout(amt, sideStake, otherStake)
                              const cap = maxBetOnSide(sideStake, otherStake)
                              const floor = minBetOnSide(sideStake, otherStake)
                              const blocked = est.overLimit || est.underLimit || amt <= 0n
                              const verb = mine ? t('pred.addStake') : t('pred.bet')
                              return (
                                <div className="flex flex-col gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isPending || blocked}
                                    onClick={() => handleBet(line, idx)}
                                    className="btn-lime py-2.5 text-[12px] disabled:opacity-50"
                                  >
                                    {isPending ? t('pred.betting') : `${verb} ${stake} USDC`}
                                  </button>
                                  {mine && myStake > 0n && (
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t('pred.addNow')}</p>
                                  )}
                                  <BetPayoutLines stake={amt} profit={est.profit} pending={est.refund || blocked} />
                                  <p className="text-[11px] text-zinc-500">
                                    {t('pred.range', { min: formatUsdc(floor), max: formatUsdc(cap) })}
                                  </p>
                                  {otherStake === 0n && (
                                    <p className="text-[11px] text-amber-300">{t('pred.openingHint', { amount: formatUsdc(OPENING_MAX) })}</p>
                                  )}
                                  {est.overLimit && (
                                    <p className="text-[11px] text-amber-300">{t('pred.tooBig', { amount: formatUsdc(cap) })}</p>
                                  )}
                                  {est.underLimit && (
                                    <p className="text-[11px] text-amber-300">{t('pred.tooSmall', { amount: formatUsdc(floor) })}</p>
                                  )}
                                </div>
                              )
                            })()
                          )
                        ) : (
                          <p className="text-[12px] text-zinc-600">{copy.hint}</p>
                        )}
                      </div>
                    )
                  })}
                </div>

                {open && info?.questionId && (
                  <div className="border-t border-zinc-800 px-4 py-2">
                    <Link to={`/mercados/${info.questionId}`} className="text-[12px] font-semibold text-lime hover:underline">
                      {t('pred.seeDetail')}
                    </Link>
                  </div>
                )}
                {canOpen && (
                  <div className="border-t border-zinc-800 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedSet(line)}
                      className="btn-ghost w-full py-2.5 text-[12px]"
                    >
                      {t('pred.openLine')}
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {selectedSet && (
        <CreateMarketModal
          set={selectedSet}
          startggEventId={selectedSet.startgg_event_id || startggEventId}
          onClose={() => {
            setSelectedSet(null)
            refreshMarkets()
          }}
        />
      )}
    </div>
  )
}
