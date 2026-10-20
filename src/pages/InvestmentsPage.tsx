import { useState } from 'react'
import { Repeat2, TrendingDown, TrendingUp } from 'lucide-react'
import { currency } from '../data'
import type { InvestmentReturn } from '../lib/investmentReturns'
import type { Holding } from '../types'
import TrustFooter from '../components/TrustFooter'

export default function InvestmentsPage({ purchases, performance, onSwap, liveBackend = false, investmentReturnsEnabled = true }: {
  purchases: Holding[]
  performance: Record<string, InvestmentReturn>
  onSwap: () => void | Promise<void>
  liveBackend?: boolean
  investmentReturnsEnabled?: boolean
}) {
  const [swapPending, setSwapPending] = useState(false)
  const activePortfolio = purchases.map((holding) => {
    const investmentPerformance = performance[holding.investmentId ?? holding.symbol]
    const currentPercent = investmentPerformance?.currentPercent ?? 0
    return {
      ...holding,
      percent: currentPercent,
      gain: investmentPerformance?.claimableGain ?? 0,
      ...(investmentPerformance ? { investmentPerformance } : {}),
    }
  })
  const totalGain = activePortfolio.reduce((total, holding) => total + holding.gain, 0)
  const totalValue = activePortfolio.reduce((total, holding) => total + holding.value, 0)

  return (
    <div className="page-content investments-page">
      <div className="investments-sticky-header">
        <div className="portfolio-totals">
          <div><span>Total Value</span><strong>{currency(totalValue)}</strong></div>
          <div>
            <span>Total Gain</span>
            <strong className={totalGain < 0 ? 'negative' : 'positive'}>
              {totalGain < 0 ? '-' : '+'}{currency(totalGain)}
            </strong>
            <button className="swap-button" type="button" disabled={swapPending || totalGain <= 0 || (liveBackend && !investmentReturnsEnabled)} onClick={async () => {
              setSwapPending(true)
              try {
                await onSwap()
              } finally {
                setSwapPending(false)
              }
            }}>
              <Repeat2 size={15} /> {swapPending ? 'Transferring…' : 'Swap'}
            </button>
          </div>
        </div>
        <h1 className="investments-title">My Investments</h1>
      </div>
      {liveBackend && !investmentReturnsEnabled && (
        <p className="performance-disclosure" role="status">
          Swap is unavailable until supabase/migrations/202610190003_investment_return_swap.sql has been applied in Supabase.
        </p>
      )}
      <p className="performance-disclosure">
        Simulated returns only: each investment has a fixed 9–12% daily target that accrues gradually through each 24-hour cycle for up to 30 days. Accrued gains can be transferred with Swap; returns are not live or guaranteed.
      </p>
      <section className="holdings-list" aria-label="Portfolio holdings">
        {activePortfolio.map((holding) => (
          <article className="holding-card" key={holding.investmentId ?? holding.symbol}>
            <div className="holding-top">
              <div><strong className="holding-symbol">{holding.symbol}</strong><span className="holding-company">{holding.company}</span></div>
              <div className="holding-performance">
                <span className={`holding-percent${holding.percent < 0 ? ' negative' : ''}`}>
                  {holding.percent < 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                  {holding.percent > 0 ? '+' : ''}{holding.percent.toFixed(2)}%
                </span>
                {holding.investmentPerformance && (
                  <>
                    <small>Daily target {holding.investmentPerformance.targetPercent.toFixed(2)}% · Day {holding.investmentPerformance.dayNumber}/30</small>
                    <small>
                      Today +{currency(holding.investmentPerformance.investedValue * holding.investmentPerformance.dailyProgressPercent / 100)}
                      {' '}({holding.investmentPerformance.dailyProgressPercent.toFixed(2)}% / {holding.investmentPerformance.targetPercent.toFixed(2)}%)
                    </small>
                    <div
                      className="investment-return-track"
                      role="progressbar"
                      aria-label={`${holding.symbol} daily return progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.min(100, holding.investmentPerformance.dailyProgressPercent / holding.investmentPerformance.targetPercent * 100)}
                    >
                      <span style={{ width: `${Math.min(100, holding.investmentPerformance.dailyProgressPercent / holding.investmentPerformance.targetPercent * 100)}%` }} />
                    </div>
                    <small>{Math.ceil(holding.investmentPerformance.remainingMs / (24 * 60 * 60 * 1000))} days remaining</small>
                  </>
                )}
              </div>
            </div>
            <div className="holding-bottom">
              <span>{holding.shares} shares</span>
              <div className="holding-value"><strong>{currency(holding.value)}</strong><span className={holding.gain < 0 ? 'negative' : 'positive'}>{holding.gain < 0 ? '-' : '+'}{currency(holding.gain)}</span></div>
            </div>
          </article>
        ))}
      </section>
      {liveBackend && <p className="performance-disclosure">Swap transfers accrued simulated returns to your account balance. Investment principal stays invested. No live brokerage or market data is connected.</p>}
      {activePortfolio.length === 0 && <p className="statement-empty">No active investment records.</p>}
      <TrustFooter />
    </div>
  )
}
