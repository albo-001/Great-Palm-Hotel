import type { Auction, AuctionProgress, AccountTransaction, Holding, LoanApplication, RewardRecord, UserProfile } from '../types'
import { supabase } from './supabase'
import { resolveAccountDisplayDetails } from './profileDisplay'
import { isNetworkFetchFailure, parseAuctionBidRpcResult, parseInvestmentReturnSwapResult, parseInvestmentRpcResult, retryNetworkRead } from './backendRpc'
import { calculateInvestmentReturn } from './investmentReturns'

type AssetPerformance = ReturnType<typeof calculateInvestmentReturn>
type InvestmentPositionRow = {
  id: string
  symbol: string
  company: string
  shares: number
  amount_charged: number
  daily_return_percent?: number | null
  returns_paid?: number | null
  created_at: string
  expires_at: string
}

export type BackendAccount = {
  profile: UserProfile
  purchases: Holding[]
  performance: Record<string, AssetPerformance>
  cooldowns: Record<string, number>
  transactions: AccountTransaction[]
  loans: LoanApplication[]
  rewards: RewardRecord[]
  firstInvestmentOfferUsed: boolean
  investmentReturnsEnabled: boolean
}

export function requireSupabase() {
  if (!supabase) throw new Error('Supabase is not configured.')
  return supabase
}

function queryError(label: string, error: { code?: string; message?: string; details?: string; hint?: string }) {
  const code = error.code ? ` (${error.code})` : ''
  const detail = error.message || 'Unknown database error.'
  const migrationHint = error.code === '42P01' || error.code === 'PGRST205'
    ? ' Apply all SQL files in supabase/migrations in timestamp order.'
    : ''
  const extra = [error.details, error.hint].filter(Boolean).join(' ')
  return new Error(`${label}${code}: ${detail}${extra ? ` ${extra}` : ''}${migrationHint}`)
}

export async function loadBackendAccount(
  userId: string,
  authProfile?: { email?: string; fullName?: unknown; phoneNumber?: unknown },
): Promise<BackendAccount> {
  const client = requireSupabase()
  const [profileResult, initialPositionsResult, transactionsResult, loansResult, rewardsResult] = await Promise.all([
    client.from('profiles').select('full_name, phone_number, referral_code, referred_by, first_investment_discount_used').eq('user_id', userId).maybeSingle(),
    client.from('investment_positions').select('id, symbol, company, shares, amount_charged, daily_return_percent, returns_paid, created_at, expires_at').eq('user_id', userId).order('created_at', { ascending: false }),
    client.from('wallet_transactions').select('id, category, description, amount, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    client.from('loan_applications').select('id, amount, duration_months, status, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
    client.from('reward_events').select('id, reward_type, title, detail, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
  ])

  let positionRows: InvestmentPositionRow[] = initialPositionsResult.data ?? []
  let positionsError = initialPositionsResult.error
  let investmentReturnsEnabled = !positionsError
  if (positionsError?.code === '42703') {
    investmentReturnsEnabled = false
    console.error(
      'Investment return columns are missing. Apply supabase/migrations/202610190001_investment_returns.sql to enable persistent return tracking and wallet transfers.',
      positionsError,
    )
    const legacyPositionsResult = await client.from('investment_positions')
      .select('id, symbol, company, shares, amount_charged, created_at, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    positionsError = legacyPositionsResult.error
    positionRows = legacyPositionsResult.data ?? []
  }
  investmentReturnsEnabled = !positionsError && positionRows.every((position) => {
    const dailyReturnPercent = Number(position.daily_return_percent)
    return Number.isFinite(dailyReturnPercent) && dailyReturnPercent >= 9 && dailyReturnPercent <= 12
  })

  const requiredResults = [
    ['Profile', profileResult],
    ['Investment history', { error: positionsError }],
    ['Wallet transaction history', transactionsResult],
    ['Loan history', loansResult],
    ['Reward history', rewardsResult],
  ] as const
  for (const [label, result] of requiredResults) {
    if (result.error) throw queryError(`Could not load ${label.toLowerCase()}`, result.error)
  }
  if (!profileResult.data) throw new Error('The account profile was not created. Run the Supabase migration and try again.')

  const profile = profileResult.data
  const displayDetails = resolveAccountDisplayDetails({
    fullName: profile.full_name,
    phoneNumber: profile.phone_number,
  }, authProfile)
  const now = Date.now()
  const allPurchases: Holding[] = positionRows.map((position) => ({
    symbol: position.symbol,
    company: position.company,
    percent: 0,
    shares: Number(position.shares),
    value: Number(position.amount_charged),
    gain: 0,
    investmentId: position.id,
    startedAt: new Date(position.created_at).getTime(),
    expiresAt: new Date(position.expires_at).getTime(),
    ...(Number.isFinite(Number(position.daily_return_percent))
      ? { dailyReturnPercent: Number(position.daily_return_percent) }
      : {}),
    ...(Number.isFinite(Number(position.returns_paid))
      ? { returnsPaid: Number(position.returns_paid) }
      : {}),
  }))
  const purchases = allPurchases.filter((purchase) => {
    const progress = calculateInvestmentReturn(purchase, now)
    return progress.remainingMs > 0 || progress.claimableGain > 0
  })
  const performance = Object.fromEntries(purchases.map((purchase) => [
    purchase.investmentId ?? purchase.symbol,
    calculateInvestmentReturn(purchase, now),
  ]))
  const cooldowns = Object.fromEntries(purchases.map((purchase) => [purchase.symbol, purchase.expiresAt ?? 0]))
  const transactions: AccountTransaction[] = (transactionsResult.data ?? []).map((transaction) => ({
    id: transaction.id,
    category: transaction.category === 'referral_commission' ? 'deposit' : transaction.category,
    description: transaction.description,
    amount: Number(transaction.amount),
    timestamp: new Date(transaction.created_at).getTime(),
  }))
  transactions.sort((left, right) => right.timestamp - left.timestamp)
  const loans: LoanApplication[] = (loansResult.data ?? []).map((loan) => ({
    id: loan.id,
    amount: Number(loan.amount),
    durationMonths: loan.duration_months,
    timestamp: new Date(loan.created_at).getTime(),
    status: loan.status === 'approved' ? 'Approved' : loan.status === 'rejected' ? 'Rejected' : 'Pending',
  }))
  const rewards: RewardRecord[] = (rewardsResult.data ?? []).map((reward) => ({
    id: reward.id,
    type: reward.reward_type,
    title: reward.title,
    detail: reward.detail,
    timestamp: new Date(reward.created_at).getTime(),
  }))

  return {
    profile: {
      ...displayDetails,
      referralCode: profile.referral_code,
      ...(profile.referred_by ? { referredBy: profile.referred_by } : {}),
    },
    purchases,
    performance,
    cooldowns,
    transactions,
    loans,
    rewards,
    firstInvestmentOfferUsed: profile.first_investment_discount_used,
    investmentReturnsEnabled,
  }
}

export async function loadBackendWalletBalance(userId: string): Promise<number> {
  const { data, error } = await requireSupabase()
    .from('wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw queryError('Could not load wallet balance', error)
  if (!data || !Number.isFinite(Number(data.balance))) {
    throw new Error('The wallet row is missing or has an invalid balance. Apply the Supabase migrations and verify the account profile/wallet records.')
  }
  return Number(data.balance)
}

export async function loadBackendAuctions(): Promise<{ auctions: Auction[]; progress: Record<string, AuctionProgress> }> {
  const client = requireSupabase()
  const auctionsRequest = client.from('auctions').select('id, title, image_url, starting_bid, bid_target, prize_value').eq('active', true).order('title')
  const [auctionsResult, statusesResult] = await Promise.all([
    auctionsRequest,
    retryNetworkRead(
      () => client.rpc('get_auction_statuses'),
      (result) => isNetworkFetchFailure(result.error),
    ),
  ])
  if (auctionsResult.error) throw queryError('Could not load auctions', auctionsResult.error)
  if (statusesResult.error) throw queryError('Could not load auction status', statusesResult.error)

  const auctions: Auction[] = (auctionsResult.data ?? []).map((auction) => ({
    id: auction.id,
    title: auction.title,
    image: auction.image_url,
    bidder: 'Bidding',
    bid: Number(auction.starting_bid),
    bidTarget: auction.bid_target,
    ...(auction.prize_value === null ? {} : { itemValue: Number(auction.prize_value) }),
  }))
  const progress: Record<string, AuctionProgress> = {}
  for (const status of statusesResult.data ?? []) {
    const entryCount = Number(status.entry_count)
    progress[status.auction_id] = {
      entries: Array.from({ length: entryCount }, (_, index) => ({
        bidder: 'Participant',
        amount: index === entryCount - 1 ? Number(status.last_amount ?? 0) : 0,
      })),
      winner: status.last_winner,
      round: status.round_number,
      entryCount,
      totalAmount: Number(status.total_amount),
      lastAmount: Number(status.last_amount ?? 0),
      nextAmount: Number(status.next_amount),
      ...(status.last_won_at ? { completedAt: new Date(status.last_won_at).getTime() } : {}),
    }
  }
  return { auctions, progress }
}

export async function buyDemoInvestment(symbol: string, company: string, shares: number, unitPrice: number) {
  const { data, error } = await requireSupabase().rpc('buy_demo_investment', {
    p_symbol: symbol,
    p_company: company,
    p_shares: shares,
    p_unit_price: unitPrice,
  })
  return parseInvestmentRpcResult(data, error)
}

export async function swapBackendInvestmentReturns() {
  const { data, error } = await requireSupabase().rpc('swap_investment_returns')
  return parseInvestmentReturnSwapResult(data, error)
}

export async function placeBackendBid(auctionId: string) {
  const { data, error } = await requireSupabase().rpc('place_auction_bid', { p_auction_id: auctionId })
  return parseAuctionBidRpcResult(data, error)
}

export async function submitBackendLoan(amount: number, durationMonths: number) {
  const { data, error } = await requireSupabase().rpc('submit_loan_application', {
    p_amount: amount,
    p_duration_months: durationMonths,
  })
  if (error) throw error
  return data as string
}
