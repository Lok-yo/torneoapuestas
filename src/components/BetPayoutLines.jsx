import { formatUsdc } from '../lib/web3/format.js'
import { useI18n } from '../i18n/I18nProvider.jsx'

/** Sportsbook-style slip: stake, profit, and total return if it wins. */
export default function BetPayoutLines({ stake, profit, pending }) {
  const { t } = useI18n()
  const put = typeof stake === 'bigint' ? stake : 0n
  const win = typeof profit === 'bigint' ? profit : 0n
  const total = put + win

  if (pending || win < 0n) {
    return (
      <div className="flex flex-col gap-0.5 text-[12px] text-zinc-300">
        <p>
          {t('pred.stake')} <span className="font-mono text-white">{formatUsdc(put)} USDC</span>
        </p>
        <p className="text-[11px] text-amber-300">{t('pred.pendingReturns')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 text-[12px] text-zinc-300">
      <p>
        {t('pred.stake')} <span className="font-mono text-white">{formatUsdc(put)} USDC</span>
      </p>
      <p>
        {t('pred.profit')} <span className="font-mono text-lime">+{formatUsdc(win)} USDC</span>
      </p>
      <p className="mt-1 font-semibold text-lime">
        {t('pred.returns')} <span className="font-mono">{formatUsdc(total)} USDC</span>
      </p>
      <p className="text-[11px] text-zinc-500">
        {t('pred.returnsBreakdown', { stake: formatUsdc(put), profit: formatUsdc(win) })}
      </p>
    </div>
  )
}
