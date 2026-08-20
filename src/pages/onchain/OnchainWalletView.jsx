import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, ArrowUpRight, PlusCircle, Banknote } from 'lucide-react'
import { useWalletConnect, useHouseAccount, useAddFunds, useWithdrawProfits, useHouseTrade } from '../../lib/web3/hooks.js'
import { formatUsdc, parseUsdc, formatCountdown } from '../../lib/web3/format.js'
import { fetchOnchainBets } from '../../lib/web3/history.js'
import { translateError } from '../../lib/web3/translateError.js'
import { isHouseConfigured } from '../../lib/web3/contracts.js'
import { useSession } from '../../auth/SessionProvider.jsx'
import { sessionAccountId } from '../../lib/web3/accountId.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const DEPOSIT_PRESETS = [20, 50, 100, 250, 500]

export default function OnchainWalletView() {
  const { t } = useI18n()
  const { address, isConnected, connectors, connect, disconnect, isConnecting, connectError, isCorrectChain, switchToAmoy } =
    useWalletConnect()
  const { session } = useSession()
  const accountId = sessionAccountId(session?.user?.id)
  const { account, refetch } = useHouseAccount()
  const { addFunds, isPending: isDepositing } = useAddFunds()
  const { withdrawProfits, isPending: isWithdrawing } = useWithdrawProfits()
  const { cancelBet, isPending: isCashing } = useHouseTrade()

  const [bets, setBets] = useState([])
  const [modal, setModal] = useState(null)
  const [depositAmount, setDepositAmount] = useState('50')
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [now, setNow] = useState(Date.now())

  const loadBets = () => {
    if (!address) {
      setBets([])
      return
    }
    fetchOnchainBets(address, accountId)
      .then(setBets)
      .catch(() => setBets([]))
  }

  useEffect(() => {
    loadBets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, accountId])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (account.withdrawable > 0n && !withdrawAmount) {
      setWithdrawAmount(formatUsdc(account.withdrawable))
    }
  }, [account.withdrawable, withdrawAmount])

  if (!isConnected) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5 border border-zinc-800 bg-[#0b0d12] p-8">
        <p className="kicker">{t('wallet.kicker')}</p>
        <h1 className="font-display text-4xl uppercase text-white">{t('wallet.connectTitle')}</h1>
        <p className="text-[14px] leading-relaxed text-zinc-400">{t('wallet.connectHint')}</p>
        <div className="flex flex-col gap-2">
          {connectors.map((connector) => (
            <button
              key={connector.uid}
              type="button"
              onClick={() => connect(connector)}
              disabled={isConnecting}
              className="btn-lime py-3 disabled:opacity-50"
            >
              {isConnecting
                ? t('wallet.connecting')
                : t('wallet.connectWallet', { name: connector.name === 'Injected' ? 'MetaMask' : connector.name })}
            </button>
          ))}
        </div>
        {connectError && (
          <p role="alert" className="text-xs text-rose-400">
            {connectError.name === 'ProviderNotFoundError' || connectError.message?.includes('Provider not found')
              ? t('wallet.noWallet')
              : connectError.message}
          </p>
        )}
      </div>
    )
  }

  const handleAddFunds = async (e) => {
    e.preventDefault()
    setActionError(null)
    setNotice(null)
    const amount = parseUsdc(depositAmount)
    if (amount <= 0n) {
      setActionError(t('wallet.chooseAmount'))
      return
    }
    try {
      await addFunds(amount)
      await refetch()
      setModal(null)
      setNotice(t('wallet.credited', { amount: formatUsdc(amount) }))
    } catch (err) {
      await refetch()
      setActionError(translateError(err) || t('wallet.depositFail'))
    }
  }

  const handleWithdraw = async (e) => {
    e.preventDefault()
    setActionError(null)
    setNotice(null)
    const amount = parseUsdc(withdrawAmount || '0')
    if (amount <= 0n) {
      setActionError(t('wallet.chooseWithdraw'))
      return
    }
    try {
      await withdrawProfits(amount)
      await refetch()
      setModal(null)
      setNotice(t('wallet.withdrew', { amount: formatUsdc(amount) }))
    } catch (err) {
      setActionError(translateError(err) || t('wallet.withdrawFail'))
    }
  }

  const handleCashOut = async (questionId) => {
    setActionError(null)
    setNotice(null)
    try {
      await cancelBet(questionId)
      await refetch()
      loadBets()
      setNotice(t('wallet.cashOutDone'))
    } catch (err) {
      setActionError(translateError(err) || t('wallet.cashOutFail'))
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="kicker">{t('wallet.kicker')}</p>
          <h1 className="mt-1 font-display text-4xl uppercase text-white">{t('wallet.title')}</h1>
          <p className="mt-1 max-w-xl text-[13px] text-zinc-500">{t('wallet.intro')}</p>
        </div>
        <button type="button" onClick={() => disconnect()} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-[12px]">
          <LogOut size={14} /> {t('wallet.disconnect')}
        </button>
      </div>

      {!isCorrectChain && (
        <button type="button" onClick={switchToAmoy} className="border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-left text-[13px] font-semibold text-amber-300">
          {t('wallet.wrongChain')}
        </button>
      )}

      {!isHouseConfigured && (
        <p className="border border-rose-500/30 bg-rose-950/20 px-4 py-3 text-[13px] text-rose-300">{t('wallet.missingHouse')}</p>
      )}

      <div className="border border-zinc-800 bg-[#0b0d12] p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-500">{t('wallet.forBetting')}</p>
        <p className="mt-2 font-display text-5xl uppercase leading-none text-white">
          {formatUsdc(account.balance)} <span className="text-2xl text-lime">USDC</span>
        </p>
        <p className="mt-3 font-mono text-[11px] text-zinc-600">{address}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="border border-zinc-800 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t('wallet.deposited')}</p>
            <p className="mt-1 font-mono text-[15px] text-white">{formatUsdc(account.deposited)}</p>
            <p className="mt-1 text-[11px] text-zinc-600">{t('wallet.depositedHint')}</p>
          </div>
          <div className="border border-zinc-800 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{t('wallet.inPlay')}</p>
            <p className="mt-1 font-mono text-[15px] text-white">{formatUsdc(account.inPlay)}</p>
            <p className="mt-1 text-[11px] text-zinc-600">{t('wallet.inPlayHint')}</p>
          </div>
          <div className="border border-lime/30 bg-lime/5 px-3 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-lime">{t('wallet.profits')}</p>
            <p className="mt-1 font-mono text-[15px] text-white">{formatUsdc(account.withdrawable)}</p>
            <p className="mt-1 text-[11px] text-zinc-600">{t('wallet.profitsHint')}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!isCorrectChain}
            onClick={() => {
              setActionError(null)
              setModal('deposit')
            }}
            className="btn-lime inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-50"
          >
            <PlusCircle size={16} /> {t('wallet.addFunds')}
          </button>
          <button
            type="button"
            disabled={!isCorrectChain || account.withdrawable <= 0n}
            onClick={() => {
              setActionError(null)
              setWithdrawAmount(formatUsdc(account.withdrawable))
              setModal('withdraw')
            }}
            className="btn-ghost inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-40"
            title={account.withdrawable <= 0n ? t('wallet.noProfits') : undefined}
          >
            <Banknote size={16} /> {t('wallet.withdrawProfits')}
          </button>
        </div>

        {account.withdrawable <= 0n && <p className="mt-3 text-[12px] text-zinc-500">{t('wallet.lockHint')}</p>}

        {notice && <p className="mt-3 text-[13px] text-emerald-400">{notice}</p>}
        {actionError && !modal && <p className="mt-3 text-[13px] text-rose-400">{actionError}</p>}
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="font-display text-2xl uppercase text-white">{t('wallet.yourBets')}</h2>
          <Link to="/apuestas" className="text-[12px] font-bold uppercase tracking-wider text-lime">
            {t('wallet.seeHistory')}
          </Link>
        </div>
        <p className="mb-3 text-[12px] text-zinc-500">{t('wallet.cashOutHint')}</p>
        {bets.length === 0 ? (
          <p className="border border-zinc-800 px-4 py-8 text-center text-[13px] text-zinc-500">{t('wallet.noBets')}</p>
        ) : (
          <ul className="flex flex-col border border-zinc-800">
            {bets.slice(0, 6).map((bet) => {
              const canCash = (bet.cancelAmount ?? 0n) > 0n
              const left = canCash ? formatCountdown(Math.max(0, bet.cancelDeadline - now)) : null
              return (
                <li key={bet.txHash} className="border-b border-zinc-800 last:border-0">
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <Link to={`/mercados/${bet.questionId}`} className="min-w-0 hover:text-lime">
                      <p className="truncate text-[14px] font-semibold text-white">{bet.matchup ?? t('wallet.market')}</p>
                      <p className="text-[12px] text-zinc-400">
                        {t('wallet.betOn')} <span className="text-lime">{bet.pick ?? t('wallet.aPick')}</span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-600">
                        {canCash ? t('wallet.cashOutLeft', { time: left }) : t('wallet.cashOutLocked')}
                      </p>
                    </Link>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="font-mono text-[13px] text-white">{formatUsdc(bet.investmentAmount)} USDC</p>
                      {canCash && (
                        <button
                          type="button"
                          disabled={isCashing || !isCorrectChain}
                          onClick={() => handleCashOut(bet.questionId)}
                          className="text-[11px] font-bold uppercase tracking-wider text-lime hover:underline disabled:opacity-40"
                        >
                          {isCashing ? t('wallet.cashingOut') : t('wallet.cashOut')}
                        </button>
                      )}
                      <ArrowUpRight size={12} className="text-zinc-600" />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {modal === 'deposit' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="deposit-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null)
          }}
        >
          <form onSubmit={handleAddFunds} className="w-full max-w-md border border-zinc-800 bg-[#0b0d12] p-6">
            <p className="kicker">{t('wallet.depositKicker')}</p>
            <h3 id="deposit-title" className="mt-1 font-display text-3xl uppercase text-white">
              {t('wallet.depositTitle')}
            </h3>
            <p className="mt-2 text-[13px] text-zinc-400">{t('wallet.depositHint')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {DEPOSIT_PRESETS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setDepositAmount(String(n))}
                  className={`px-3 py-1.5 text-[13px] font-semibold ${
                    depositAmount === String(n) ? 'bg-lime text-[#0a0c08]' : 'border border-zinc-700 text-zinc-300 hover:border-zinc-500'
                  }`}
                >
                  {n} USDC
                </button>
              ))}
            </div>
            <label className="mt-4 block text-[12px] text-zinc-500">
              {t('wallet.otherAmount')}
              <span className="mt-1 flex items-center border border-zinc-800">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  className="h-11 w-full bg-transparent px-3 font-mono text-sm text-white outline-none"
                />
                <span className="pr-3 text-[11px] font-bold uppercase tracking-wider text-lime">USDC</span>
              </span>
            </label>
            {actionError && <p className="mt-3 text-[13px] text-rose-400">{actionError}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setModal(null)} className="btn-ghost flex-1 py-2.5">
                {t('wallet.cancel')}
              </button>
              <button type="submit" disabled={isDepositing} className="btn-lime flex-1 py-2.5 disabled:opacity-50">
                {isDepositing ? t('wallet.confirmMm') : t('wallet.putAmount', { amount: formatUsdc(parseUsdc(depositAmount)) })}
              </button>
            </div>
          </form>
        </div>
      )}

      {modal === 'withdraw' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null)
          }}
        >
          <form onSubmit={handleWithdraw} className="w-full max-w-md border border-zinc-800 bg-[#0b0d12] p-6">
            <p className="kicker">{t('wallet.withdrawKicker')}</p>
            <h3 id="withdraw-title" className="mt-1 font-display text-3xl uppercase text-white">
              {t('wallet.withdrawTitle')}
            </h3>
            <p className="mt-2 text-[13px] text-zinc-400">{t('wallet.withdrawHint', { amount: formatUsdc(account.withdrawable) })}</p>
            <label className="mt-4 block text-[12px] text-zinc-500">
              {t('wallet.amount')}
              <span className="mt-1 flex items-center border border-zinc-800">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  className="h-11 w-full bg-transparent px-3 font-mono text-sm text-white outline-none"
                />
                <span className="pr-3 text-[11px] font-bold uppercase tracking-wider text-lime">USDC</span>
              </span>
            </label>
            {actionError && <p className="mt-3 text-[13px] text-rose-400">{actionError}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setModal(null)} className="btn-ghost flex-1 py-2.5">
                {t('wallet.cancel')}
              </button>
              <button type="submit" disabled={isWithdrawing} className="btn-lime flex-1 py-2.5 disabled:opacity-50">
                {isWithdrawing ? t('wallet.confirmMm') : t('wallet.withdrawToMm')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
