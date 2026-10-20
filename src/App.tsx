import { useCallback, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { AnimatePresence, motion } from 'framer-motion'
import { Home as HomeIcon, TrendingUp, WalletCards, UserRound } from 'lucide-react'
import HomePage from './pages/HomePage'
import ArenaPage from './pages/ArenaPage'
import InvestmentsPage from './pages/InvestmentsPage'
import AccountPage from './pages/AccountPage'
import AuthPage from './pages/AuthPage'
import type { AccountTransaction, Auction, AuctionProgress, Holding, LoanApplication, RewardRecord, Stock, Theme, UserProfile } from './types'
import { auctions, currency, getNextAuctionBid } from './data'
import { buyDemoInvestment, swapBackendInvestmentReturns, loadBackendAccount, loadBackendAuctions, loadBackendWalletBalance, placeBackendBid, submitBackendLoan } from './lib/backend'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { resolveAccountDisplayDetails } from './lib/profileDisplay'
import { calculateInvestmentReturn, investmentLifespanMs } from './lib/investmentReturns'

const portfolioStorageKey = 'darknode-demo-purchases'
const cooldownStorageKey = 'darknode-invest-cooldowns'
const balanceStorageKey = 'darknode-demo-balance'
const auctionProgressStorageKey = 'darknode-demo-auction-progress'
const transactionsStorageKey = 'darknode-demo-transactions'
const loanApplicationsStorageKey = 'darknode-demo-loan-applications'
const rewardRecordsStorageKey = 'darknode-demo-reward-records'
const firstInvestmentUsedStorageKey = 'darknode-first-investment-offer-used'
const userProfileStorageKey = 'darknode-demo-user-profile'
const firstInvestmentDiscountRate = 0.2
const investmentCooldownMs = investmentLifespanMs
const startingBalance = 24562.84
const performanceTickMs = 60_000
type PortfolioPerformance = Record<string, ReturnType<typeof calculateInvestmentReturn>>

function loadBalance(): number {
  try {
    const savedBalance = window.localStorage.getItem(balanceStorageKey)
    if (savedBalance === null) return startingBalance
    const stored = Number(savedBalance)
    return Number.isFinite(stored) && stored >= 0 ? stored : startingBalance
  } catch {
    return startingBalance
  }
}

function loadUserProfile(): UserProfile {
  const defaultProfile: UserProfile = {
    fullName: 'John Doe',
    phoneNumber: '+1 (555) 123-4567',
    referralCode: createReferralCode(),
  }
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(userProfileStorageKey) ?? 'null')
    if (typeof stored !== 'object' || stored === null) return defaultProfile
    const profile = stored as Record<string, unknown>
    return typeof profile.fullName === 'string' && typeof profile.phoneNumber === 'string'
      ? {
        fullName: profile.fullName,
        phoneNumber: profile.phoneNumber,
        referralCode: typeof profile.referralCode === 'string' ? profile.referralCode : defaultProfile.referralCode,
        ...(typeof profile.referredBy === 'string' ? { referredBy: profile.referredBy } : {}),
      }
      : defaultProfile
  } catch {
    return defaultProfile
  }
}

function createReferralCode(): string {
  return `DN${window.crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`
}

function loadTransactions(): AccountTransaction[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(transactionsStorageKey) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((value): value is AccountTransaction =>
      typeof value === 'object' && value !== null
      && 'id' in value && typeof value.id === 'string'
      && 'category' in value && ['bid', 'deposit', 'withdraw', 'investment', 'swap'].includes(value.category as string)
      && 'description' in value && typeof value.description === 'string'
      && 'amount' in value && typeof value.amount === 'number' && Number.isFinite(value.amount)
      && 'timestamp' in value && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp),
    )
  } catch {
    return []
  }
}

function loadLoanApplications(): LoanApplication[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(loanApplicationsStorageKey) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((value): value is LoanApplication =>
      typeof value === 'object' && value !== null
      && 'id' in value && typeof value.id === 'string'
      && 'amount' in value && typeof value.amount === 'number' && Number.isFinite(value.amount)
      && 'durationMonths' in value && typeof value.durationMonths === 'number' && Number.isFinite(value.durationMonths)
      && 'timestamp' in value && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp)
      && 'status' in value && ['Pending', 'Approved', 'Rejected'].includes(value.status as string),
    )
  } catch {
    return []
  }
}

function loadRewardRecords(): RewardRecord[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(rewardRecordsStorageKey) ?? '[]')
    if (!Array.isArray(stored)) return []
    return stored.filter((value): value is RewardRecord =>
      typeof value === 'object' && value !== null
      && 'id' in value && typeof value.id === 'string'
      && 'type' in value && (value.type === 'auction_win' || value.type === 'first_investment' || value.type === 'referral_commission')
      && 'title' in value && typeof value.title === 'string'
      && 'detail' in value && typeof value.detail === 'string'
      && 'timestamp' in value && typeof value.timestamp === 'number' && Number.isFinite(value.timestamp),
    )
  } catch {
    return []
  }
}

function loadFirstInvestmentOfferUsed(): boolean {
  try {
    const stored = window.localStorage.getItem(firstInvestmentUsedStorageKey)
    if (stored !== null) return stored === 'true'
    return loadPurchases().length > 0 || loadTransactions().some(({ category }) => category === 'investment')
  } catch {
    return false
  }
}

function isHolding(value: unknown): value is Holding {
  if (typeof value !== 'object' || value === null) return false
  const holding = value as Record<string, unknown>
  return typeof holding.symbol === 'string'
    && typeof holding.company === 'string'
    && typeof holding.percent === 'number'
    && typeof holding.shares === 'number'
    && typeof holding.value === 'number'
    && typeof holding.gain === 'number'
    && (holding.investmentId === undefined || typeof holding.investmentId === 'string')
    && (holding.startedAt === undefined || (typeof holding.startedAt === 'number' && Number.isFinite(holding.startedAt)))
    && (holding.expiresAt === undefined || (typeof holding.expiresAt === 'number' && Number.isFinite(holding.expiresAt)))
    && (holding.dailyReturnPercent === undefined || (typeof holding.dailyReturnPercent === 'number' && Number.isFinite(holding.dailyReturnPercent)))
    && (holding.returnsPaid === undefined || (typeof holding.returnsPaid === 'number' && Number.isFinite(holding.returnsPaid)))
}

function loadPurchases(): Holding[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(portfolioStorageKey) ?? '[]')
    if (!Array.isArray(stored)) return []
    const savedCooldowns: unknown = JSON.parse(window.localStorage.getItem(cooldownStorageKey) ?? '{}')
    const cooldowns = typeof savedCooldowns === 'object' && savedCooldowns !== null && !Array.isArray(savedCooldowns)
      ? savedCooldowns as Record<string, unknown>
      : {}
    const now = Date.now()
    return stored.filter(isHolding).flatMap((holding) => {
      const expiresAt = holding.expiresAt
        ?? (typeof cooldowns[holding.symbol] === 'number' ? cooldowns[holding.symbol] as number : now + investmentCooldownMs)
      const startedAt = holding.startedAt ?? expiresAt - investmentCooldownMs
      const normalized = {
        ...holding,
        investmentId: holding.investmentId ?? `legacy-${holding.symbol}-${startedAt}`,
        startedAt,
        expiresAt,
      }
      const performance = calculateInvestmentReturn(normalized, now)
      return expiresAt > now || performance.claimableGain > 0 ? [normalized] : []
    })
  } catch {
    return []
  }
}

function loadCooldowns(): Record<string, number> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(cooldownStorageKey) ?? '{}')
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([, value]) =>
      typeof value === 'number' && Number.isFinite(value) && value > 0,
    ))
  } catch {
    return {}
  }
}

function loadPerformance(): PortfolioPerformance {
  const now = Date.now()
  return Object.fromEntries(loadPurchases().map((holding) => [
    holding.investmentId ?? holding.symbol,
    calculateInvestmentReturn(holding, now),
  ]))
}

function loadAuctionProgress(): Record<string, AuctionProgress> {
  const emptyProgress: Record<string, AuctionProgress> = Object.fromEntries(
    auctions.map(({ id }) => [id, { entries: [], winner: null, round: 0 }]),
  )
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(auctionProgressStorageKey) ?? '{}')
    if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return emptyProgress
    for (const auction of auctions) {
      const value = (stored as Record<string, unknown>)[auction.id]
      if (typeof value !== 'object' || value === null) continue
      const record = value as Record<string, unknown>
      if (!Array.isArray(record.entries)) continue
      const entries = record.entries.filter((entry): entry is { bidder: string; amount: number } =>
        typeof entry === 'object' && entry !== null
        && 'bidder' in entry && typeof entry.bidder === 'string'
        && 'amount' in entry && typeof entry.amount === 'number' && Number.isFinite(entry.amount),
      )
      const winner = typeof record.winner === 'string' ? record.winner : null
      let round = typeof record.round === 'number' && Number.isInteger(record.round) && record.round >= 0
        ? record.round
        : 0
      let completedAt = typeof record.completedAt === 'number' && Number.isFinite(record.completedAt)
        ? record.completedAt
        : undefined
      if (winner && entries.length >= auction.bidTarget) {
        entries.length = 0
        round += 1
        completedAt ??= Date.now()
      }
      if (auction.itemValue !== undefined) {
        const total = entries.reduce((sum, entry) => sum + entry.amount, 0)
        const validAmounts = entries.every(({ amount }) => amount >= 50 && amount < 200)
        const validActiveProgress = !winner && entries.length < auction.bidTarget && total < auction.itemValue
        const validRecentWinner = Boolean(winner) && entries.length === 0
        if ((!validAmounts && !validRecentWinner) || (!validActiveProgress && !validRecentWinner)) continue
      }
      emptyProgress[auction.id] = { entries, winner, round, ...(completedAt === undefined ? {} : { completedAt }) }
    }
    return emptyProgress
  } catch {
    return emptyProgress
  }
}

function BottomNavigation() {
  const tabs = [
    { to: '/', label: 'Home', Icon: HomeIcon, end: true },
    { to: '/arena', label: 'Arena', Icon: TrendingUp },
    { to: '/investments', label: 'Investments', Icon: WalletCards },
    { to: '/account', label: 'Account', Icon: UserRound },
  ]

  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map(({ to, label, Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
          <Icon size={22} strokeWidth={2} aria-hidden="true" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function NotFoundPage() {
  return (
    <section className="not-found">
      <h1>Page not found</h1>
      <p>We couldn't find that page.</p>
      <Link className="primary-button inline-button" to="/">Return to Home</Link>
    </section>
  )
}

function LoadingPage() {
  return <section className="not-found" role="status"><p>Loading your secure account…</p></section>
}

function AppRoutes({ theme, toggleTheme }: { theme: Theme; toggleTheme: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()
  const backendMode = isSupabaseConfigured
  const [notice, setNotice] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(!backendMode)
  const [backendDataUserId, setBackendDataUserId] = useState<string | null>(null)
  const backendDataReady = !backendMode || !session || backendDataUserId === session.user.id
  const [backendBalanceLoaded, setBackendBalanceLoaded] = useState(!backendMode)
  const [backendAuctions, setBackendAuctions] = useState(auctions)
  const [userProfile, setUserProfile] = useState<UserProfile>(() => backendMode
    ? { fullName: '', phoneNumber: '', referralCode: '' }
    : loadUserProfile())
  const [purchases, setPurchases] = useState<Holding[]>(() => backendMode ? [] : loadPurchases())
  const [investmentReturnsEnabled, setInvestmentReturnsEnabled] = useState(!backendMode)
  const [cooldowns, setCooldowns] = useState<Record<string, number>>(() => backendMode ? {} : loadCooldowns())
  const [balance, setBalance] = useState(() => backendMode ? 0 : loadBalance())
  const [performance, setPerformance] = useState<PortfolioPerformance>(() => backendMode ? {} : loadPerformance())
  const [auctionProgress, setAuctionProgress] = useState<Record<string, AuctionProgress>>(() => backendMode
    ? Object.fromEntries(auctions.map(({ id }) => [id, { entries: [], winner: null, round: 1 }]))
    : loadAuctionProgress())
  const [transactions, setTransactions] = useState<AccountTransaction[]>(() => backendMode ? [] : loadTransactions())
  const [loanApplications, setLoanApplications] = useState<LoanApplication[]>(() => backendMode ? [] : loadLoanApplications())
  const [rewardRecords, setRewardRecords] = useState<RewardRecord[]>(() => backendMode ? [] : loadRewardRecords())
  const [firstInvestmentOfferUsed, setFirstInvestmentOfferUsed] = useState(() => backendMode ? false : loadFirstInvestmentOfferUsed())
  const swapInProgress = useRef(false)
  const accountRefreshVersion = useRef(0)
  const activeUserId = useRef<string | null>(null)
  const refreshBackendState = useCallback(async (user: Session['user']) => {
    if (swapInProgress.current) return
    const refreshVersion = accountRefreshVersion.current
    const [balanceResult, accountResult, auctionResult] = await Promise.allSettled([
      loadBackendWalletBalance(user.id),
      loadBackendAccount(user.id, {
        email: user.email,
        fullName: user.user_metadata.full_name,
        phoneNumber: user.user_metadata.phone_number,
      }),
      loadBackendAuctions(),
    ])
    if (swapInProgress.current || refreshVersion !== accountRefreshVersion.current) return
    const failures: string[] = []
    if (balanceResult.status === 'fulfilled') {
      setBalance(balanceResult.value)
      setBackendBalanceLoaded(true)
    } else {
      failures.push(balanceResult.reason instanceof Error ? balanceResult.reason.message : 'Could not load wallet balance.')
    }
    if (accountResult.status === 'fulfilled') {
      const account = accountResult.value
      setUserProfile(account.profile)
      setPurchases(account.purchases)
      setInvestmentReturnsEnabled(account.investmentReturnsEnabled)
      setPerformance(account.performance)
      setCooldowns(account.cooldowns)
      setTransactions(account.transactions)
      setLoanApplications(account.loans)
      setRewardRecords(account.rewards)
      setFirstInvestmentOfferUsed(account.firstInvestmentOfferUsed)
    } else {
      failures.push(accountResult.reason instanceof Error ? accountResult.reason.message : 'Could not load account data.')
    }
    if (auctionResult.status === 'fulfilled') {
      setBackendAuctions(auctionResult.value.auctions)
      setAuctionProgress(auctionResult.value.progress)
    } else {
      failures.push(auctionResult.reason instanceof Error ? auctionResult.reason.message : 'Could not load auctions.')
    }
    if (failures.length > 0) throw new Error(failures.join(' '))
  }, [])

  const markBackendDataLoaded = (userId: string) => setBackendDataUserId(userId)

  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null
      const userChanged = activeUserId.current !== nextUserId
      activeUserId.current = nextUserId
      setSession(nextSession)
      if (userChanged) {
        setBackendBalanceLoaded(false)
        setInvestmentReturnsEnabled(!backendMode)
        setUserProfile(nextSession
          ? { ...resolveAccountDisplayDetails({}, {
            email: nextSession.user.email,
            fullName: nextSession.user.user_metadata.full_name,
            phoneNumber: nextSession.user.user_metadata.phone_number,
          }), referralCode: '' }
          : { fullName: '', phoneNumber: '', referralCode: '' })
        setBackendDataUserId(null)
      }
      setAuthReady(true)
    })
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) throw error
      const nextUserId = data.session?.user.id ?? null
      const userChanged = activeUserId.current !== nextUserId
      activeUserId.current = nextUserId
      setSession(data.session)
      if (userChanged) {
        setBackendBalanceLoaded(false)
        setInvestmentReturnsEnabled(!backendMode)
        setUserProfile(data.session
          ? { ...resolveAccountDisplayDetails({}, {
            email: data.session.user.email,
            fullName: data.session.user.user_metadata.full_name,
            phoneNumber: data.session.user.user_metadata.phone_number,
          }), referralCode: '' }
          : { fullName: '', phoneNumber: '', referralCode: '' })
        setBackendDataUserId(null)
      }
      setAuthReady(true)
    }).catch((error: unknown) => {
      if (!active) return
      console.error('Could not restore Supabase authentication session.', error)
      setNotice(error instanceof Error ? error.message : 'Could not restore your account session.')
      setAuthReady(true)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [backendMode])

  useEffect(() => {
    if (!backendMode || !authReady) return
    if (!session?.user.id) return
    let active = true
    // Async account loading completes after the Supabase request settles.
    // oxlint-disable-next-line
    void refreshBackendState(session.user).then(() => {
      if (active) markBackendDataLoaded(session.user.id)
    }).catch((error: unknown) => {
      if (!active) return
      console.error('Could not load Supabase account data.', error)
      setNotice(error instanceof Error ? error.message : 'Could not load account data. Check your Supabase connection and database migrations.')
      markBackendDataLoaded(session.user.id)
    })
    return () => { active = false }
  }, [authReady, backendMode, refreshBackendState, session?.user])

  useEffect(() => {
    if (!backendMode || !session?.user.id || !backendDataReady) return
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void refreshBackendState(session.user).catch((error: unknown) => {
        console.error('Could not refresh Supabase account data.', error)
        setNotice(error instanceof Error ? error.message : 'Could not refresh account data.')
      })
    }
    const interval = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refresh)
    }
  }, [backendDataReady, backendMode, refreshBackendState, session?.user])

  const recordTransaction = (category: AccountTransaction['category'], description: string, amount: number) => {
    setTransactions((current) => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      category,
      description,
      amount,
      timestamp: Date.now(),
    }, ...current])
  }

  const applyForLoan = async (amount: number, durationMonths: number) => {
    if (backendMode) {
      const id = await submitBackendLoan(amount, durationMonths)
      setLoanApplications((current) => [{
        id,
        amount,
        durationMonths,
        timestamp: Date.now(),
        status: 'Pending',
      }, ...current])
      return
    }
    setLoanApplications((current) => [{
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      amount,
      durationMonths,
      timestamp: Date.now(),
      status: 'Pending',
    }, ...current])
  }

  const recordDemoPurchase = (stock: Stock, shares: number): 'success' | 'cooldown' | 'insufficient-balance' => {
    const now = Date.now()
    if ((cooldowns[stock.symbol] ?? 0) > now) return 'cooldown'
    const investmentValue = stock.price * shares
    const discount = firstInvestmentOfferUsed ? 0 : investmentValue * firstInvestmentDiscountRate
    const amountCharged = investmentValue - discount
    if (amountCharged > balance) return 'insufficient-balance'
    const investmentId = window.crypto.randomUUID()
    const purchase = {
      symbol: stock.symbol,
      company: stock.name,
      percent: 0,
      shares,
      value: amountCharged,
      gain: 0,
      investmentId,
      startedAt: now,
      expiresAt: now + investmentCooldownMs,
    }

    setPurchases((current) => {
      const existing = current.find((holding) => holding.symbol === stock.symbol)
      if (existing) {
        return current.map((holding) => holding.symbol === stock.symbol
          ? {
            ...holding,
            shares: holding.shares + shares,
            value: holding.value + amountCharged,
            gain: 0,
            investmentId,
            startedAt: now,
            expiresAt: now + investmentCooldownMs,
          }
          : holding)
      }

      return [...current, purchase]
    })
    setCooldowns((current) => ({ ...current, [stock.symbol]: now + investmentCooldownMs }))
    setPerformance((current) => ({
      ...current,
      [investmentId]: calculateInvestmentReturn(purchase, now),
    }))
    setBalance((current) => current - amountCharged)
    recordTransaction('investment', `${stock.symbol} shares${discount ? ' (20% first-investment offer)' : ''}`, -amountCharged)
    if (discount > 0) {
      setFirstInvestmentOfferUsed(true)
      setRewardRecords((current) => [{
        id: `first-investment-${now}`,
        type: 'first_investment',
        title: '20% first-investment offer',
        detail: `Saved ${currency(discount)} on ${stock.symbol}`,
        timestamp: now,
      }, ...current])
    }
    return 'success'
  }

  const recordPurchase = async (stock: Stock, shares: number): Promise<'success' | 'cooldown' | 'insufficient-balance'> => {
    if (!backendMode) return recordDemoPurchase(stock, shares)
    if (!session) throw new Error('Sign in to record an investment.')
    try {
      const result = await buyDemoInvestment(stock.symbol, stock.name, shares, stock.price)
      const startedAt = Date.now()
      const expiresAt = startedAt + investmentCooldownMs
      const chargedAmount = Number(result.amount_charged)
      const discountAmount = Number(result.discount_amount)
      const purchase = {
        symbol: stock.symbol,
        company: stock.name,
        percent: 0,
        shares,
        value: Number(result.amount_charged),
        gain: 0,
        investmentId: result.investment_id,
        startedAt,
        expiresAt,
      }
      setBalance(Number(result.balance))
      setPurchases((current) => [...current, purchase])
      setCooldowns((current) => ({ ...current, [stock.symbol]: expiresAt }))
      setPerformance((current) => ({
        ...current,
        [result.investment_id]: calculateInvestmentReturn(purchase, startedAt),
      }))
      setTransactions((current) => [{
        id: result.investment_id,
        category: 'investment',
        description: `${stock.symbol} demo investment`,
        amount: -chargedAmount,
        timestamp: Date.now(),
      }, ...current])
      if (discountAmount > 0) {
        setFirstInvestmentOfferUsed(true)
        setRewardRecords((current) => [{
          id: `first-investment-${result.investment_id}`,
          type: 'first_investment',
          title: '20% first-investment offer',
          detail: `Saved ${currency(discountAmount)} on ${stock.symbol}`,
          timestamp: Date.now(),
        }, ...current])
      }
      return 'success'
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      if (message.includes('30-day investment term')) return 'cooldown'
      if (message.includes('Insufficient account balance')) return 'insufficient-balance'
      throw error
    }
  }

  const swapInvestmentGains = async (): Promise<void> => {
    if (backendMode) {
      if (!investmentReturnsEnabled) {
        setNotice('Investment returns cannot be transferred yet. Apply supabase/migrations/202610190001_investment_returns.sql in the Supabase SQL Editor.')
        return
      }
      if (!session) {
        setNotice('Sign in to transfer investment returns.')
        return
      }
      swapInProgress.current = true
      accountRefreshVersion.current += 1
      const swapStartedAt = Date.now()
      const claimableAmounts = purchases.map((purchase) =>
        calculateInvestmentReturn(purchase, swapStartedAt).claimableGain,
      )
      try {
        const result = await swapBackendInvestmentReturns()
        const updatedPurchases = purchases.map((purchase, index) => ({
          ...purchase,
          returnsPaid: (purchase.returnsPaid ?? 0) + claimableAmounts[index],
        }))
        setBalance(result.balance)
        if (result.amount_swapped <= 0) {
          setNotice('There are no accrued investment returns to transfer yet.')
          return
        }
        setPurchases(updatedPurchases)
        setPerformance(Object.fromEntries(updatedPurchases.map((purchase) => [
          purchase.investmentId ?? purchase.symbol,
          calculateInvestmentReturn(purchase, swapStartedAt),
        ])))
        setTransactions((current) => [{
          id: `returns-${Date.now()}`,
          category: 'swap',
          description: 'Investment returns transferred to balance',
          amount: result.amount_swapped,
          timestamp: Date.now(),
        }, ...current])
        setNotice(`${currency(result.amount_swapped)} in investment returns transferred to your account balance. Your invested principal is unchanged.`)
      } catch (error) {
        console.error('Could not transfer investment returns.', error)
        const message = error instanceof Error ? error.message : 'Could not transfer investment returns. Please try again.'
        if (message.includes('missing the swap RPC or investment returns schema')) setInvestmentReturnsEnabled(false)
        setNotice(message)
      } finally {
        swapInProgress.current = false
      }
      return
    }

    const now = Date.now()
    const amounts = purchases.map((purchase) => calculateInvestmentReturn(purchase, now).claimableGain)
    const amount = amounts.reduce((total, gain) => total + gain, 0)
    if (amount <= 0) {
      setNotice('There are no accrued investment returns to transfer yet.')
      return
    }
    setBalance((current) => current + amount)
    const updatedPurchases = purchases.map((purchase, index) => ({
      ...purchase,
      returnsPaid: (purchase.returnsPaid ?? 0) + amounts[index],
    }))
    setPurchases(updatedPurchases)
    setPerformance(Object.fromEntries(updatedPurchases.map((purchase) => [
      purchase.investmentId ?? purchase.symbol,
      calculateInvestmentReturn(purchase, now),
    ])))
    recordTransaction('swap', 'Investment gains transferred to balance', amount)
    setNotice(`${currency(amount)} in investment returns transferred to your account balance. Your invested principal is unchanged.`)
  }

  const placeBid = (auction: Auction, amount: number): { result: 'success' | 'insufficient-balance' | 'closed' | 'invalid-bid'; winner: string | null } => {
    const progress = auctionProgress[auction.id] ?? { entries: [], winner: null, round: 0 }
    if (progress.entries.length >= auction.bidTarget) return { result: 'closed', winner: null }
    if (amount !== getNextAuctionBid(auction, progress.entries, progress.round)) return { result: 'invalid-bid', winner: null }
    if (amount > balance) return { result: 'insufficient-balance', winner: null }
    const entries = [...progress.entries, { bidder: 'You', amount }]
    const winner = entries.length >= auction.bidTarget
      ? entries[Math.floor(Math.random() * entries.length)].bidder
      : null
    const latestCompletion = Math.max(0, ...Object.values(auctionProgress).map((item) => item.completedAt ?? 0))
    const completedAt = winner ? Math.max(Date.now(), latestCompletion + 1) : undefined
    setAuctionProgress((current) => ({
      ...current,
      [auction.id]: {
        entries: winner ? [] : entries,
        winner: winner ?? progress.winner,
        round: winner ? progress.round + 1 : progress.round,
        ...(completedAt === undefined ? (progress.completedAt === undefined ? {} : { completedAt: progress.completedAt }) : { completedAt }),
      },
    }))
    setBalance((current) => current - amount)
    recordTransaction('bid', auction.title, -amount)
    if (winner === 'You') {
      setRewardRecords((current) => [{
        id: `auction-win-${auction.id}-${completedAt}`,
        type: 'auction_win',
        title: `Won ${auction.title}`,
        detail: 'Demo auction win',
        timestamp: completedAt ?? Date.now(),
      }, ...current])
    }
    return { result: 'success', winner }
  }

  const placeBackendAuctionBid = async (auction: Auction) => {
    if (!session) throw new Error('Sign in to place a bid.')
    const result = await placeBackendBid(auction.id)
    const completedAt = result.winner_name ? Date.now() : undefined
    setBalance(Number(result.balance))
    setTransactions((current) => [{
      id: `${auction.id}-${Date.now()}`,
      category: 'bid',
      description: auction.title,
      amount: -Number(result.entry_amount),
      timestamp: Date.now(),
    }, ...current])
    setAuctionProgress((current) => {
      const previous = current[auction.id] ?? { entries: [], winner: null, round: result.new_round }
      const entries = result.winner_name
        ? []
        : [...previous.entries, { bidder: 'You', amount: Number(result.entry_amount) }]
      return {
        ...current,
        [auction.id]: {
          entries,
          winner: result.winner_name ?? previous.winner,
          round: result.new_round,
          entryCount: result.entry_count,
          totalAmount: Number(result.total_amount),
          lastAmount: Number(result.last_amount ?? 0),
          nextAmount: Number(result.next_amount),
          ...(completedAt === undefined ? (previous.completedAt === undefined ? {} : { completedAt: previous.completedAt }) : { completedAt }),
        },
      }
    })
    return { result: 'success' as const, winner: result.winner_name }
  }

  useEffect(() => {
    const refreshPerformance = () => {
      const now = Date.now()
      setPerformance(Object.fromEntries(purchases.map((purchase) => [
        purchase.investmentId ?? purchase.symbol,
        calculateInvestmentReturn(purchase, now),
      ])))
    }
    refreshPerformance()
    const timer = window.setInterval(refreshPerformance, performanceTickMs)
    return () => window.clearInterval(timer)
  }, [purchases])

  useEffect(() => {
    const now = Date.now()
    const futureExpiries = purchases
      .map((purchase) => purchase.expiresAt ?? Number.POSITIVE_INFINITY)
      .filter((expiresAt) => expiresAt > now)
    const nextExpiry = Math.min(...futureExpiries)
    if (!Number.isFinite(nextExpiry)) return
    const timer = window.setTimeout(() => {
      const now = Date.now()
      const remaining = purchases.filter((purchase) =>
        purchase.expiresAt === undefined
        || purchase.expiresAt > now
        || calculateInvestmentReturn(purchase, now).claimableGain > 0,
      )
        setPurchases(remaining)
    }, Math.max(0, nextExpiry - Date.now()))
    return () => window.clearTimeout(timer)
  }, [backendMode, purchases])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    if (backendMode) return
    try {
      window.localStorage.setItem(portfolioStorageKey, JSON.stringify(purchases))
      window.localStorage.setItem(cooldownStorageKey, JSON.stringify(cooldowns))
      window.localStorage.setItem(balanceStorageKey, String(balance))
      window.localStorage.setItem(auctionProgressStorageKey, JSON.stringify(auctionProgress))
      window.localStorage.setItem(transactionsStorageKey, JSON.stringify(transactions))
      window.localStorage.setItem(loanApplicationsStorageKey, JSON.stringify(loanApplications))
      window.localStorage.setItem(rewardRecordsStorageKey, JSON.stringify(rewardRecords))
      window.localStorage.setItem(firstInvestmentUsedStorageKey, String(firstInvestmentOfferUsed))
      window.localStorage.setItem(userProfileStorageKey, JSON.stringify(userProfile))
    } catch (error) {
      console.error('Could not save demo portfolio data in this browser.', error)
    }
  }, [auctionProgress, backendMode, balance, cooldowns, firstInvestmentOfferUsed, loanApplications, performance, purchases, rewardRecords, transactions, userProfile])

  useEffect(() => {
    document.querySelector('.app-main')?.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className={`app-shell${theme === 'dark' ? ' dark-theme' : ''}`}>
      <main className="app-main">
        <div
          key={location.pathname}
          className="route-transition"
        >
          <Routes>
            <Route path="/" element={<HomePage theme={theme} toggleTheme={toggleTheme} notify={setNotice} onPurchase={recordPurchase} cooldowns={cooldowns} balance={balance} firstInvestmentDiscountAvailable={!firstInvestmentOfferUsed} backendMode={backendMode} />} />
            <Route path="/arena" element={backendMode
              ? !authReady || !backendDataReady ? <LoadingPage /> : !session ? <Navigate to="/signin" replace state={{ from: location.pathname }} /> : <ArenaPage notify={setNotice} balance={balance} placeBid={placeBackendAuctionBid} auctionProgress={auctionProgress} auctions={backendAuctions} backendMode />
              : <ArenaPage notify={setNotice} balance={balance} placeBid={placeBid} auctionProgress={auctionProgress} />} />
            <Route path="/investments" element={backendMode
              ? !authReady || !backendDataReady ? <LoadingPage /> : !session ? <Navigate to="/signin" replace state={{ from: location.pathname }} /> : <InvestmentsPage
                purchases={purchases}
                performance={performance}
                liveBackend
                investmentReturnsEnabled={investmentReturnsEnabled}
                onSwap={swapInvestmentGains}
              />
              : <InvestmentsPage
              purchases={purchases}
              performance={performance}
              onSwap={swapInvestmentGains}
            />} />
            <Route path="/account" element={backendMode
              ? !authReady || !backendDataReady ? <LoadingPage /> : !session ? <Navigate to="/signin" replace state={{ from: location.pathname }} /> : <AccountPage notify={setNotice} balance={balance} balanceLoaded={backendBalanceLoaded} transactions={transactions} loanApplications={loanApplications} rewardRecords={rewardRecords} firstInvestmentOfferUsed={firstInvestmentOfferUsed} userProfile={userProfile} referralCode={userProfile.referralCode} onApplyLoan={applyForLoan} onWalletRefresh={() => refreshBackendState(session.user)} backendMode onLogout={async () => {
                if (!supabase) return
                const { error } = await supabase.auth.signOut()
                if (error) throw error
              }} />
              : <AccountPage notify={setNotice} balance={balance} balanceLoaded={backendBalanceLoaded} transactions={transactions} loanApplications={loanApplications} rewardRecords={rewardRecords} firstInvestmentOfferUsed={firstInvestmentOfferUsed} userProfile={userProfile} referralCode={userProfile.referralCode} onApplyLoan={applyForLoan} onWalletRefresh={async () => {}} backendMode={false} onLogout={() => navigate('/signin')} />} />
            <Route path="/signin" element={<AuthPage mode="signin" />} />
            <Route path="/signup" element={<AuthPage mode="signup" onSignup={(profile) => setUserProfile({
              ...profile,
              referralCode: createReferralCode(),
            })} />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </div>
      </main>
      {!['/signin', '/signup'].includes(location.pathname) && <BottomNavigation />}
      <AnimatePresence>
        {notice && (
          <motion.div
            className="toast"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return window.localStorage.getItem('darknode-theme') === 'dark' ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem('darknode-theme', theme)
    } catch {
      // The app still works when storage is unavailable; the preference lasts for this tab.
    }
  }, [theme])

  const toggleTheme = () => setTheme((current) => current === 'light' ? 'dark' : 'light')

  return (
    <BrowserRouter>
      <AppRoutes theme={theme} toggleTheme={toggleTheme} />
    </BrowserRouter>
  )
}
