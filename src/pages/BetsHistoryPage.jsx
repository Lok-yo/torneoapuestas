import { Link } from 'react-router-dom'
import { useWalletConnect } from '../lib/web3/hooks.js'
import { fetchOnchainBets } from '../lib/web3/history.js'
import { formatUsdc } from '../lib/web3/format.js'
import { FEATURE_FLAGS } from '../config/featureFlags.js'
import { useAsync } from '../lib/useAsync.js'
import { useSession } from '../auth/SessionProvider.jsx'
import { sessionAccountId } from '../lib/web3/accountId.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function BetsHistoryPage() {
  const { t } = useI18n()
  const { address, isConnected, connectors, connect, isCorrectChain, switchToAmoy } = useWalletConnect()
  const { session } = useSession()
  const accountId = sessionAccountId(session?.user?.id)

  if (!FEATURE_FLAGS.web3) {
    return <p className="py-12 text-center text-sm text-zinc-500">{t('bets.web3Off')}</p>
  }

  if (!isConnected) {
    return (
      <div className="mx-auto mt-12 flex max-w-md flex-col gap-4 border border-zinc-800 bg-[#0b0d12] p-8 text-center">
        <p className="kicker">{t('bets.kicker')}</p>
        <h1 className="font-display text-4xl uppercase text-white">{t('bets.historyTitle')}</h1>
        <p className="text-[14px] text-zinc-400">{t('bets.connectHint')}</p>
        {connectors.map((connector) => (
          <button
            key={connector.uid}
            type="button"
            onClick={() => connect(connector)}
            className="btn-lime py-3"
          >
            {t('wallet.connectWallet', { name: connector.name === 'Injected' ? 'MetaMask' : connector.name })}
          </button>
        ))}
      </div>
    )
  }

  return <OnchainHistory address={address} accountId={accountId} isCorrectChain={isCorrectChain} switchToAmoy={switchToAmoy} />
}

function OnchainHistory({ address, accountId, isCorrectChain, switchToAmoy }) {
  const { t } = useI18n()
  const { status, data, error } = useAsync(() => fetchOnchainBets(address, accountId), [address, accountId])
  const bets = data ?? []
  const spent = bets.reduce((sum, b) => sum + Number(b.investmentAmount || 0n), 0)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="kicker">{t('bets.kicker')}</p>
        <h1 className="mt-1 font-display text-4xl uppercase text-white">{t('bets.historyHeading')}</h1>
        <p className="mt-1 max-w-xl text-[14px] text-zinc-400">{t('bets.cycleHint')}</p>
      </div>

      {!isCorrectChain && (
        <button type="button" onClick={switchToAmoy} className="border border-amber-500/40 bg-amber-950/20 px-4 py-3 text-left text-[13px] font-semibold text-amber-300">
          {t('bets.switchChain')}
        </button>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-zinc-800 bg-[#0b0d12] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">{t('bets.count')}</p>
          <p className="mt-1 font-display text-3xl text-white">{bets.length}</p>
        </div>
        <div className="border border-zinc-800 bg-[#0b0d12] px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">{t('bets.staked')}</p>
          <p className="mt-1 font-display text-3xl text-lime">{formatUsdc(BigInt(Math.trunc(spent)))}</p>
        </div>
      </div>

      {status === 'loading' && <p className="text-sm text-zinc-500">{t('bets.reading')}</p>}
      {status === 'error' && (
        <p className="text-sm text-rose-400">
          {t('bets.readFail')} {error?.message}
        </p>
      )}

      {status === 'ready' && bets.length === 0 ? (
        <div className="border border-zinc-800 bg-[#0b0d12] px-4 py-10 text-center">
          <p className="text-sm text-zinc-400">{t('bets.none')}</p>
          <Link to="/torneos" className="mt-3 inline-block text-[13px] font-semibold text-lime hover:underline">
            {t('bets.goTournament')}
          </Link>
        </div>
      ) : (
        <ul className="flex flex-col border border-zinc-800">
          {bets.map((bet) => (
            <li key={bet.txHash} className="border-b border-zinc-800 last:border-0">
              <Link to={`/mercados/${bet.questionId}`} className="flex flex-col gap-1 px-4 py-4 hover:bg-zinc-900/40 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{bet.matchup ?? t('wallet.market')}</p>
                  <p className="text-[16px] font-semibold text-white">
                    {t('bets.youBetOn')} <span className="text-lime">{bet.pick ?? t('wallet.aPick')}</span>
                  </p>
                </div>
                <p className="font-mono text-[15px] text-zinc-200">{formatUsdc(bet.investmentAmount)} USDC</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
