import { useEffect, useMemo, useState } from 'react'
import { Bell, Check, ChevronRight, Moon, Search, Sun, TrendingDown, TrendingUp } from 'lucide-react'
import { stocks, currency } from '../data'
import type { Stock, Theme } from '../types'
import TrustFooter from '../components/TrustFooter'
import Modal from '../components/Modal'
import DemoNotice from '../components/DemoNotice'

type HomePageProps = {
  theme: Theme
  toggleTheme: () => void
  notify: (message: string) => void
  onPurchase: (stock: Stock, shares: number) => Promise<'success' | 'cooldown' | 'insufficient-balance'>
  cooldowns: Record<string, number>
  balance: number
  firstInvestmentDiscountAvailable: boolean
  backendMode: boolean
}

type AssetFilter = 'ALL' | 'STOCKS' | 'ETFs' | 'KENYA'

const etfSymbols = new Set([
  'SPY', 'VOO', 'QQQ', 'VTI', 'VT', 'IWDA', 'VUG', 'VTV', 'VYM', 'SCHD',
  'IWM', 'DIA', 'SMH', 'SOXX', 'RSP', 'ARKK', 'IWF', 'IVV', 'VGT', 'XLF',
  'XLE', 'XLV', 'GLD', 'SLV', 'TLT',
])

const kenyaSymbols = new Set([
  'SCOM', 'COOP', 'KCB', 'EQTY', 'ABSA', 'NCBA', 'IMH', 'SBIC', 'SCBK',
  'DTK', 'HFCK', 'EABL', 'KPLC', 'KEGN', 'KQ', 'NMG', 'BAMB', 'CGEN',
  'JUB', 'BRIT', 'KNRE', 'SLAM', 'SASN', 'KUKZ', 'WTK',
])

const assetFilters: AssetFilter[] = ['ALL', 'STOCKS', 'ETFs', 'KENYA']

const dayMs = 24 * 60 * 60 * 1000

export default function HomePage({ theme, toggleTheme, notify, onPurchase, cooldowns, balance, firstInvestmentDiscountAvailable, backendMode }: HomePageProps) {
  const [query, setQuery] = useState('')
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('ALL')
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null)
  const [shares, setShares] = useState(10)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const [offerOpen, setOfferOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [noticeRead, setNoticeRead] = useState(false)
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const filteredStocks = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return stocks.filter(({ symbol, name }) => {
      const matchesSearch = !needle || `${symbol} ${name}`.toLowerCase().includes(needle)
      const matchesFilter = assetFilter === 'ALL'
        || (assetFilter === 'ETFs' && etfSymbols.has(symbol))
        || (assetFilter === 'KENYA' && kenyaSymbols.has(symbol))
        || (assetFilter === 'STOCKS' && !etfSymbols.has(symbol) && !kenyaSymbols.has(symbol))
      return matchesSearch && matchesFilter
    })
  }, [assetFilter, query])

  const closeInvest = () => {
    setSelectedStock(null)
    setShares(10)
  }
  const grossInvestmentCost = selectedStock ? selectedStock.price * shares : 0
  const firstInvestmentDiscount = firstInvestmentDiscountAvailable ? grossInvestmentCost * 0.2 : 0
  const investmentAmountDue = grossInvestmentCost - firstInvestmentDiscount

  return (
    <div className="page-content home-page">
      <div className="home-sticky-header">
        <header className="home-header">
          <div className="brand-lockup">
            <div className="brand-mark">DN</div>
            <div className="brand-text">
              <h1>DarkNode</h1>
              <p>smart money</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="header-icon-button" type="button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
              {theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button className="header-icon-button notification-trigger" type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Notifications">
              <Bell size={19} />
              {!noticeRead && <span className="notification-dot" />}
            </button>
          </div>
          {notificationsOpen && (
            <div className="notification-popover">
              <div className="popover-heading">
                <strong>Notifications</strong>
                <button className="text-button" type="button" onClick={() => setNoticeRead(true)}>Mark all as read</button>
              </div>
              <button className="notification-row" type="button" onClick={() => setNoticeRead(true)}>
                <span className="notification-badge"><TrendingUp size={16} /></span>
                <span><strong>Your portfolio is up today</strong><small>AAPL gained KSh 2.45 per share</small></span>
                <ChevronRight size={16} />
              </button>
              <button className="notification-row" type="button" onClick={() => setNotificationsOpen(false)}>
                <span className="notification-badge bonus"><Check size={16} /></span>
                <span><strong>A new offer is waiting</strong><small>Claim your first-investment bonus</small></span>
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </header>

        <label className="search-field">
          <Search size={19} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search stocks & ETFs"
            aria-label="Search stocks and ETFs"
          />
        </label>

        <section className="offer-banner" aria-label="Limited time offer">
          <div className="offer-eyebrow">Limited Time Offer</div>
          <div className="offer-title">Get 20% off on your first investment</div>
          <button className="offer-button" type="button" onClick={() => setOfferOpen(true)}>Claim Now</button>
        </section>

        <div className="asset-filters" role="group" aria-label="Filter assets">
          {assetFilters.map((filter) => (
            <button
              className={`asset-filter${assetFilter === filter ? ' active' : ''}`}
              type="button"
              key={filter}
              onClick={() => setAssetFilter(filter)}
              aria-pressed={assetFilter === filter}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <section className="stock-section" aria-label="Stocks and ETFs">
        {filteredStocks.length ? (
          <div className="stock-grid">
            {filteredStocks.map((stock) => (
              <article className="stock-card" key={stock.symbol}>
                <div className="stock-icon" aria-hidden="true">
                  <img src={stock.icon} alt="" loading="lazy" />
                </div>
                <div className="stock-symbol">{stock.symbol}</div>
                <div className="stock-name">{stock.name}</div>
                <div className="stock-price">{currency(stock.price)}</div>
                <div className={`stock-change${stock.change < 0 ? ' negative' : ''}`}>
                  {stock.change < 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
                  <span>{stock.change < 0 ? '-' : '+'}{currency(stock.change)}</span>
                </div>
                {(() => {
                  const remainingDays = Math.min(30, Math.ceil(((cooldowns[stock.symbol] ?? 0) - currentTime) / dayMs))
                  const isCoolingDown = remainingDays > 0
                  return (
                    <button
                      className={`primary-button stock-invest${isCoolingDown ? ' cooling-down' : ''}`}
                      type="button"
                      disabled={isCoolingDown}
                      onClick={() => setSelectedStock(stock)}
                      aria-label={isCoolingDown ? `${stock.symbol} available to reinvest in ${remainingDays} days` : `Invest in ${stock.symbol}`}
                    >
                      {isCoolingDown ? `${remainingDays} day${remainingDays === 1 ? '' : 's'}` : 'Invest'}
                    </button>
                  )
                })()}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={22} />
            <strong>No assets found</strong>
            <span>Try a different filter, name, or ticker symbol.</span>
          </div>
        )}
      </section>

      <TrustFooter />

      {selectedStock && (
        <Modal title={`Invest in ${selectedStock.symbol}`} onClose={closeInvest} className="investment-modal">
          <div className="investment-asset">
            <span className="large-stock-icon"><img src={selectedStock.icon} alt="" /></span>
            <div><strong>{selectedStock.symbol}</strong><span>{selectedStock.name}</span></div>
          </div>
          <label className="field-label" htmlFor="share-count">Number of Shares</label>
          <input
            id="share-count"
            className="form-input"
            type="number"
            min="1"
            max="100000"
            step="1"
            value={shares}
            onChange={(event) => setShares(Math.max(1, Number(event.target.value) || 1))}
          />
          <div className="cost-summary">
            <span>Investment Value</span><strong>{currency(grossInvestmentCost)}</strong>
          </div>
          {firstInvestmentDiscount > 0 && (
            <div className="cost-summary first-investment-discount">
              <span>20% first-investment discount</span><strong>−{currency(firstInvestmentDiscount)}</strong>
            </div>
          )}
          <div className="cost-summary">
            <span>Amount Due</span><strong>{currency(investmentAmountDue)}</strong>
          </div>
          <div className="cost-summary available-funds">
            <span>Available Balance</span><strong>{currency(balance)}</strong>
          </div>
          <div className="performance-card">
            <div className="performance-heading"><strong>Simulated daily target</strong><span>9–12%</span></div>
            <div className="daily-return">
              <span>Target range after each 24-hour cycle</span>
              <strong>{currency(investmentAmountDue * 0.09)}–{currency(investmentAmountDue * 0.12)}</strong>
            </div>
            <small>Accrues gradually over 24 hours for up to 30 days. Simulation only; not guaranteed.</small>
          </div>
          {backendMode
            ? <DemoNotice>Investment entries are recorded in your DarkNode database for demonstration only. No broker, live market prices, or real securities are connected.</DemoNotice>
            : <DemoNotice />}
          <div className="modal-actions">
            <button className="secondary-button" type="button" onClick={closeInvest}>Cancel</button>
            <button className="primary-button" type="button" disabled={investmentAmountDue > balance || purchaseSubmitting} onClick={async () => {
              setPurchaseSubmitting(true)
              try {
                const result = await onPurchase(selectedStock, shares)
                closeInvest()
                notify(result === 'success'
                  ? `Demo investment recorded. ${currency(investmentAmountDue)} charged${firstInvestmentDiscount > 0 ? ` after a ${currency(firstInvestmentDiscount)} first-investment discount` : ''}. Reinvestment unlocks in 30 days.`
                  : result === 'cooldown'
                    ? 'This asset is on a 30-day reinvestment cooldown.'
                    : 'Insufficient account balance for this investment.')
              } catch (error) {
                notify(error instanceof Error ? error.message : 'Investment could not be recorded. Please try again.')
              } finally {
                setPurchaseSubmitting(false)
              }
            }}>{purchaseSubmitting ? 'Processing…' : 'Confirm'}</button>
          </div>
        </Modal>
      )}

      {offerOpen && (
        <Modal title="Welcome bonus" onClose={() => setOfferOpen(false)}>
          <div className="offer-details">
            <span className="offer-gift">🎁</span>
            <h3>Get 20% off on your first investment</h3>
            <p>Your 20% discount is automatically applied to your first successful investment.</p>
          </div>
          <DemoNotice />
          <button className="primary-button full-button" type="button" onClick={() => setOfferOpen(false)}>Got it</button>
        </Modal>
      )}
    </div>
  )
}
