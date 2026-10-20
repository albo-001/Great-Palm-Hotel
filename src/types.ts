export type Theme = 'light' | 'dark'

export type UserProfile = {
  fullName: string
  phoneNumber: string
  referralCode: string
  referredBy?: string
}

export type Stock = {
  symbol: string
  name: string
  price: number
  change: number
  icon: string
}

export type Holding = {
  symbol: string
  company: string
  percent: number
  shares: number
  value: number
  gain: number
  investmentId?: string
  startedAt?: number
  expiresAt?: number
  dailyReturnPercent?: number
  returnsPaid?: number
}

export type AccountTransaction = {
  id: string
  category: 'bid' | 'deposit' | 'withdraw' | 'investment' | 'swap'
  description: string
  amount: number
  timestamp: number
  status?: string
}

export type LoanApplication = {
  id: string
  amount: number
  durationMonths: number
  timestamp: number
  status: 'Pending' | 'Approved' | 'Rejected'
}

export type RewardRecord = {
  id: string
  type: 'auction_win' | 'first_investment' | 'referral_commission'
  title: string
  detail: string
  timestamp: number
}

export type Auction = {
  id: string
  title: string
  image: string
  bidder: string
  bid: number
  bidTarget: number
  itemValue?: number
}

export type AuctionProgress = {
  entries: { bidder: string; amount: number }[]
  winner: string | null
  round: number
  completedAt?: number
  entryCount?: number
  totalAmount?: number
  lastAmount?: number
  nextAmount?: number
}
