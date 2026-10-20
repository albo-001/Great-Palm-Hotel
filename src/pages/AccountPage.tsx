import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  Bot, Copy, FileText, Gift, HandCoins, LogOut,
  MessageCircle, Send, Smartphone, Shield, Share2, UserRoundPlus, Wallet,
} from 'lucide-react'
import { auctions, currency, stocks } from '../data'
import type { AccountTransaction, LoanApplication, RewardRecord, UserProfile } from '../types'
import Modal from '../components/Modal'
import DemoNotice from '../components/DemoNotice'
import TrustFooter from '../components/TrustFooter'
import MpesaPaymentModal from '../components/MpesaPaymentModal'

type Panel = 'deposit' | 'withdraw' | 'statement' | 'p2p' | 'airtime' | 'rewards' | 'loans' | 'support' | 'security' | 'refer' | null

const actions: { key: Exclude<Panel, null>; title: string; subtitle: string; Icon: typeof FileText; color: string }[] = [
  { key: 'statement', title: 'Statement', subtitle: 'View history', Icon: FileText, color: 'blue' },
  { key: 'loans', title: 'Loans', subtitle: 'Get funds', Icon: Wallet, color: 'emerald' },
  { key: 'p2p', title: 'P2P', subtitle: 'Send money', Icon: HandCoins, color: 'purple' },
  { key: 'airtime', title: 'Airtime', subtitle: 'Top up', Icon: Smartphone, color: 'green' },
  { key: 'rewards', title: 'Rewards', subtitle: 'Earn points', Icon: Gift, color: 'orange' },
  { key: 'support', title: 'Support', subtitle: 'Chat now', Icon: MessageCircle, color: 'cyan' },
  { key: 'security', title: 'Privacy', subtitle: 'Stay private', Icon: Shield, color: 'red' },
  { key: 'refer', title: 'Refer', subtitle: 'Get KSh 10', Icon: UserRoundPlus, color: 'pink' },
]

const socialLinks = [
  { name: 'Facebook', href: 'https://facebook.com/DarkNodeInvestment', className: 'facebook' },
  { name: 'Instagram', href: 'https://www.instagram.com/darknode_investment?srtk=N3Fham4ya3J6bnJn', className: 'instagram' },
  { name: 'Telegram', href: 'https://t.me/+RVm6MzxzWi44NjY8', className: 'telegram' },
  { name: 'WhatsApp', href: 'https://chat.whatsapp.com/H0NWKaNViNm5XjPqwyyEd3?s=sh&p=a&mlu=4&ilr=4', className: 'whatsapp' },
]

type StatementCategory = 'bids' | 'investments' | 'loans'
type ChatMessage = {
  id: string
  sender: 'assistant' | 'user'
  text: string
  timestamp?: number
}

const assistantSuggestions = ['How do bids work?', 'How do I invest?', 'Deposit or withdraw']

function getAssistantReply(question: string, backendMode = false): string {
  const query = question.toLowerCase().trim()
  const matchedStock = stocks.find((stock) =>
    query.includes(stock.symbol.toLowerCase()) || query.includes(stock.name.toLowerCase()),
  )
  if (matchedStock) {
    return `${matchedStock.name} (${matchedStock.symbol}) is listed at ${currency(matchedStock.price)} with a displayed change of ${matchedStock.change >= 0 ? '+' : ''}${matchedStock.change}%. These are demo figures, not live market data. Browse and search assets on Home.`
  }
  const matchedAuction = auctions.find((auction) => {
    const words = auction.title.toLowerCase().replace(/^win (a|an) /, '').split(/\s+/)
    return words.some((word) => word.length > 3 && query.includes(word))
  })
  if (matchedAuction && /(bid|auction|win|entry|price|cost)/.test(query)) {
    const valueInfo = matchedAuction.itemValue === undefined
      ? 'Its entry price increases based on the previous bid.'
      : `Its estimated prize value is ${currency(matchedAuction.itemValue)}, split across multiple entries below KSh 200 each.`
    return backendMode
      ? `${matchedAuction.title}: ${valueInfo} Confirmed entries are stored in your Supabase account and deducted from your DarkNode wallet. When the round fills, the database draws a winner and opens a new round. This is a prize simulation, not a real award.`
      : `${matchedAuction.title}: ${valueInfo} Each confirmed demo bid is deducted from your demo balance. When the entry target fills, a winner is drawn and a new round starts.`
  }
  if (/(stock|etf|share|market|ticker|symbol)/.test(query)) {
    return 'Find stocks and ETFs on Home. Use search or the ALL, STOCKS, ETFs, and KENYA filters to narrow the list. Prices and performance shown are demo data, not live market results or investment advice.'
  }
  if (/(bid|auction|prize|winner|win)/.test(query)) {
    return backendMode
      ? 'Open Arena to see database-backed auction rounds. Entries are debited from your DarkNode wallet; the database draws and records a winner when the target fills, then opens a new round. Prize awards are simulated; no real prizes are issued.'
      : 'Open Arena to see active auctions, bid progress, entry prices, and estimated prize values. Prize entries are below KSh 200 each. A winner is drawn when the target fills, then that auction starts a new round. This is a local demo draw.'
  }
  if (/(invest|buy|purchase|share|cooldown|30.day|expire|expiry|investment)/.test(query)) {
    return backendMode
      ? 'Choose an asset on Home to create a database-backed simulated investment record. The catalog quote is illustrative, and no brokerage order or real security is purchased. The position has a 30-day term; your first successful record receives a 20% discount.'
      : 'To invest, choose an asset on Home and confirm the number of shares. The cost is deducted from your demo balance. Each purchase has a 30-day term and reinvestment cooldown; the holding disappears when the term ends. Simulated returns are not real or guaranteed.'
  }
  if (/(deposit|withdraw|transaction|mpesa|m.pesa|balance)/.test(query)) {
    return 'Deposit uses an M-Pesa STK prompt and is credited only after the server verifies a successful payment. Withdrawals require Safaricom-approved production B2C access and remain reserved until Safaricom confirms the final result.'
  }
  if (/(loan|borrow|pending|application)/.test(query)) {
    return backendMode
      ? 'Submit a loan request from Account → Loans. It is stored in your account as Pending for review. No loan is issued or credit decision is made automatically.'
      : 'Submit a loan request from Account → Loans. Your demo request is marked Pending and appears in Account → Statement → Loans. No loan is issued or credit decision made in this demo.'
  }
  if (/(refer|referral|invite|commission)/.test(query)) {
    return backendMode
      ? 'Share your referral link from Account → Refer. Supabase records the referral when the invitee signs up with your code. On their first successful investment, the database credits you 20% of its gross value, funded by the platform; this is separate from their first-investment discount.'
      : 'Share your referral link from Account → Refer. The program is planned to reward 20% of a verified invitee’s first investment. Signup captures the referral code, but invite verification and commission credit require the backend and are not active in this demo.'
  }
  if (/(statement|history|record|csv|export)/.test(query)) {
    return 'Open Account → Statement and choose Bids, Transaction, Investments, or Loans. Use the period selector to filter records; Export CSV downloads the visible financial activity.'
  }
  if (/(swap|gain|profit|return|performance)/.test(query)) {
    return backendMode
      ? 'On My Investments, Swap transfers accrued simulated gains to your account balance when the investment-returns migration is installed. Holdings and their 30-day term are unchanged. Returns are simulated and not guaranteed.'
      : 'On My Investments, Swap transfers available positive simulated gains to your demo account balance and resets the gain summary baseline. Holdings and their 30-day term are unchanged. Simulated returns are not real or guaranteed.'
  }
  if (/(sign.?in|log.?in|account|password|sign.?up|register|logout)/.test(query)) {
    return backendMode
      ? 'Email and password authentication is handled by Supabase Auth. Your full name and phone number are separate display details in your profile. Passwords are not saved in browser local storage.'
      : 'Sign-in and sign-up screens are available, but authentication is not connected yet. Your credentials are not sent to or saved by this demo.'
  }
  if (/(airtime|p2p|send money|support|help)/.test(query)) {
    return 'P2P Send Money and Purchase Airtime currently show a Coming Soon notice. No transfer or purchase is processed. You can also email Queries@darknodeinvestments.xyz for assistance.'
  }
  return `I can help with stocks and ETFs, auctions and bids, investments, deposit and withdrawal screen availability, statements, loans, swaps, and account access. Tell me which area you need help with, and I’ll guide you. ${backendMode ? 'Backend records are simulations and do not connect to live financial services.' : 'This assistant uses demo app information only.'}`
}

function createChatMessages(question: string, backendMode = false): ChatMessage[] {
  const timestamp = Date.now()
  return [
    { id: `${timestamp}-user`, sender: 'user', text: question, timestamp },
    { id: `${timestamp}-assistant`, sender: 'assistant', text: getAssistantReply(question, backendMode), timestamp: timestamp + 1 },
  ]
}

type AccountPageProps = {
  notify: (message: string) => void
  balance: number
  balanceLoaded: boolean
  transactions: AccountTransaction[]
  loanApplications: LoanApplication[]
  rewardRecords: RewardRecord[]
  firstInvestmentOfferUsed: boolean
  userProfile: UserProfile
  referralCode: string
  onApplyLoan: (amount: number, durationMonths: number) => void | Promise<void>
  onWalletRefresh: () => Promise<void>
  onLogout: () => void | Promise<void>
  backendMode: boolean
}

export default function AccountPage({ notify, balance, balanceLoaded, transactions, loanApplications, rewardRecords, firstInvestmentOfferUsed, userProfile, referralCode, onApplyLoan, onWalletRefresh, onLogout, backendMode }: AccountPageProps) {
  const [panel, setPanel] = useState<Panel>(null)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
    id: 'welcome',
    sender: 'assistant',
    text: backendMode
      ? 'Hi! I’m your DarkNode app assistant. Ask me about account records, investment simulations, bids, referrals, loans, or statements.'
      : 'Hi! I’m your DarkNode app assistant. Ask me about stocks and ETFs, auctions, investments, deposits, statements, loans, or account settings.',
  }])

  return (
    <div className="page-content account-page">
      <section className="balance-card">
        <div className="profile-row">
          <div className="avatar">{userProfile.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')}</div>
          <div><strong>{userProfile.fullName}</strong><span>{userProfile.phoneNumber}</span></div>
        </div>
        <div className="balance-label">Account Balance</div>
        <div className="balance-value" aria-live="polite">
          {backendMode && !balanceLoaded ? 'Balance unavailable' : currency(balance)}
        </div>
        <div className="balance-actions">
          <button className="balance-button" type="button" onClick={() => setPanel('deposit')}><span className="down-arrow">↓</span>Deposit</button>
          <button className="balance-button withdraw" type="button" onClick={() => setPanel('withdraw')}>
            <span className="up-arrow">↑</span>Withdraw
          </button>
        </div>
      </section>

      <section className="quick-actions-section">
        <h2 className="section-caption">QUICK ACTION</h2>
        <div className="quick-action-grid">
          {actions.map(({ key, title, subtitle, Icon, color }) => (
            <button className="quick-action" type="button" key={key} onClick={() => setPanel(key)}>
              <span className={`quick-icon ${color}`}><Icon size={19} strokeWidth={2} /></span>
              <strong>{title}</strong><small>{subtitle}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="connect-section" aria-labelledby="connect-heading">
        <h2 className="section-caption email-caption">EMAIL US</h2>
        <a className="contact-email" href="mailto:Queries@darknodeinvestments.xyz">Queries@darknodeinvestments.xyz</a>
        <h2 className="section-caption connect-caption" id="connect-heading">Let's Connect</h2>
        <div className="social-links">
          {socialLinks.map(({ name, href, className }) => (
            <a
              className={`social-link ${className}`}
              href={href}
              key={name}
              target="_blank"
              rel="noreferrer"
              aria-label={`Visit ${name}`}
              title={name}
            >
              <SocialIcon name={name} />
            </a>
          ))}
        </div>
        <button className="logout-button" type="button" onClick={() => {
          void Promise.resolve(onLogout()).catch((error: unknown) => {
            notify(error instanceof Error ? error.message : 'Could not sign out.')
          })
        }}>
          <LogOut size={16} />
          Logout
        </button>
      </section>
      <TrustFooter />
      {panel && <AccountPanel key={panel} panel={panel} balance={balance} balanceLoaded={balanceLoaded} profilePhone={userProfile.phoneNumber} transactions={transactions} loanApplications={loanApplications} rewardRecords={rewardRecords} firstInvestmentOfferUsed={firstInvestmentOfferUsed} referralCode={referralCode} onApplyLoan={onApplyLoan} onWalletRefresh={onWalletRefresh} backendMode={backendMode} chatMessages={chatMessages} setChatMessages={setChatMessages} onClose={() => setPanel(null)} notify={notify} />}
    </div>
  )
}

function SocialIcon({ name }: { name: string }) {
  if (name === 'Facebook') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-8.2h2.8l.4-3.2h-3.2v-2c0-.9.3-1.6 1.6-1.6h1.7V3.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.3H7.3v3.2h2.8V21h3.4Z" fill="currentColor" /></svg>
  }
  if (name === 'Instagram') {
    return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5.2" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4.1" stroke="currentColor" strokeWidth="2" /><circle cx="17.7" cy="6.6" r="1.15" fill="currentColor" /></svg>
  }
  if (name === 'Telegram') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m21.7 4.2-3.2 15.1c-.2 1.1-.9 1.4-1.8.9l-5-3.7-2.4 2.3c-.3.3-.5.5-1 .5l.4-5.1 9.3-8.4c.4-.4-.1-.6-.6-.2L6 12.9l-5-1.6c-1.1-.3-1.1-1.1.2-1.6l19.3-7.4c.9-.3 1.7.2 1.2 1.9Z" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.04 2a9.9 9.9 0 0 0-8.48 15.02L2 22l5.1-1.34A9.96 9.96 0 1 0 12.04 2Zm0 18.1a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.03.8.81-2.95-.2-.31A8.13 8.13 0 1 1 12.04 20.1Zm4.46-6.08c-.24-.12-1.43-.71-1.65-.79-.22-.08-.38-.12-.54.12-.16.24-.62.79-.76.95-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.1.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.46-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.51.1.46-.07 1.43-.59 1.63-1.15.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" /></svg>
}

function AccountPanel({ panel, onClose, notify, balance, balanceLoaded, profilePhone, transactions, loanApplications, rewardRecords, firstInvestmentOfferUsed, referralCode, onApplyLoan, onWalletRefresh, backendMode, chatMessages, setChatMessages }: {
  panel: Exclude<Panel, null>
  onClose: () => void
  notify: (message: string) => void
  balance: number
  balanceLoaded: boolean
  profilePhone: string
  transactions: AccountTransaction[]
  loanApplications: LoanApplication[]
  rewardRecords: RewardRecord[]
  firstInvestmentOfferUsed: boolean
  referralCode: string
  onApplyLoan: AccountPageProps['onApplyLoan']
  onWalletRefresh: AccountPageProps['onWalletRefresh']
  backendMode: boolean
  chatMessages: ChatMessage[]
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
}) {
  const [comingSoonFeature, setComingSoonFeature] = useState<string | null>(null)
  const [amount, setAmount] = useState('100')
  const [duration, setDuration] = useState('12')
  const [phone, setPhone] = useState('')
  const [recipient, setRecipient] = useState('')
  const [period, setPeriod] = useState('Last 7 days')
  const [statementCategory, setStatementCategory] = useState<StatementCategory>('bids')
  const [statementOpenedAt] = useState(() => Date.now())
  const [chatText, setChatText] = useState('')
  const [actionSubmitting, setActionSubmitting] = useState(false)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    chatMessagesRef.current?.scrollTo({ top: chatMessagesRef.current.scrollHeight, behavior: 'smooth' })
  }, [chatMessages])

  const sendChatMessage = (text = chatText) => {
    const question = text.trim()
    if (!question) return
    const newMessages = createChatMessages(question, backendMode)
    setChatMessages((current) => [...current, ...newMessages])
    setChatText('')
  }

  const filteredTransactions = useMemo(() => {
    const periodDays = period === 'Last 7 days' ? 7 : period === 'Last 30 days' ? 30 : 90
    const startTime = statementOpenedAt - periodDays * 24 * 60 * 60 * 1000
    return transactions.filter((transaction) => transaction.timestamp >= startTime)
  }, [period, statementOpenedAt, transactions])
  const filteredLoanApplications = useMemo(() => {
    const periodDays = period === 'Last 7 days' ? 7 : period === 'Last 30 days' ? 30 : 90
    const startTime = statementOpenedAt - periodDays * 24 * 60 * 60 * 1000
    return loanApplications.filter((application) => application.timestamp >= startTime)
  }, [loanApplications, period, statementOpenedAt])

  const titleMap: Record<Exclude<Panel, null>, string> = {
    deposit: 'Deposit Funds',
    withdraw: 'Withdraw Funds',
    statement: 'Account Statement',
    p2p: 'Send Money',
    airtime: 'Buy Airtime',
    rewards: 'Rewards Hub',
    loans: 'Apply for Loan',
    support: 'Live Support',
    security: 'Terms & Conditions',
    refer: 'Refer & Earn',
  }

  const exportStatement = () => {
    const rows = [
      ['Date', 'Category', 'Description', 'Amount'],
      ...filteredTransactions.map((transaction) => [
        new Date(transaction.timestamp).toISOString(),
        transaction.category,
        transaction.description,
        String(transaction.amount),
      ]),
    ]
    const csv = rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const link = document.createElement('a')
    link.href = url
    link.download = backendMode ? 'darknode-statement.csv' : 'darknode-statement-demo.csv'
    link.click()
    URL.revokeObjectURL(url)
    notify('Statement exported.')
  }

  const renderTransactionSection = (title: string, categories: AccountTransaction['category'][]) => {
    const sectionTransactions = filteredTransactions.filter((transaction) => categories.includes(transaction.category))
    return (
      <section className="statement-section" key={title} aria-label={`${title} transactions`}>
        {sectionTransactions.length > 0 ? (
          <div className="transaction-list">
            {sectionTransactions.map((transaction) => (
              <div className="transaction-row" key={transaction.id}>
                <span className="transaction-icon"><FileText size={16} /></span>
                <span className="transaction-info">
                  <strong>{transaction.description}</strong>
                  <small>{new Date(transaction.timestamp).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                </span>
                <strong className={transaction.status && !['succeeded', 'failed', 'cancelled'].includes(transaction.status)
                  ? ''
                  : transaction.amount < 0 ? 'negative' : 'positive'}>
                  {transaction.status
                    ? `${transaction.status.replaceAll('_', ' ')} · `
                    : transaction.amount < 0 ? '−' : '+'}{currency(transaction.amount)}
                </strong>
              </div>
            ))}
          </div>
        ) : <p className="statement-empty">No {title.toLowerCase()} in this period.</p>}
      </section>
    )
  }

  const shareReferral = async () => {
    const inviteUrl = new URL('/signup', window.location.origin)
    inviteUrl.searchParams.set('ref', referralCode)
    const text = `Join me on DarkNode. Sign up using my referral link: ${inviteUrl.toString()}`
    try {
      if (navigator.share) await navigator.share({ title: 'Join me on DarkNode', text, url: inviteUrl.toString() })
      else {
        await navigator.clipboard.writeText(inviteUrl.toString())
        notify(backendMode
          ? 'Referral link copied. Your 20% commission is credited after your invitee makes their first backend-recorded investment.'
          : 'Referral link copied. Referral rewards require the Supabase backend.')
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      notify('Sharing is unavailable in this browser.')
    }
  }

  const monthlyPayment = useMemo(() => {
    const principal = Number(amount) || 0
    const months = Number(duration) || 1
    return principal * (1 + 0.055 * months / 12) / months
  }, [amount, duration])

  if (panel === 'deposit' || panel === 'withdraw') {
    return (
      <MpesaPaymentModal
        action={panel}
        balance={balance}
        balanceLoaded={balanceLoaded}
        profilePhone={profilePhone}
        backendMode={backendMode}
        onClose={onClose}
        onWalletRefresh={onWalletRefresh}
      />
    )
  }

  return (
    <>
    <Modal title={titleMap[panel]} onClose={onClose} className="account-modal">
      {panel === 'statement' && (
        <div className="account-panel-body">
          <div className="statement-toolbar">
            <label className="field-label" htmlFor="statement-period">Period</label>
            <select id="statement-period" className="form-input compact-input" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option>Last 7 days</option><option>Last 30 days</option><option>Last 90 days</option>
            </select>
            <button className="outline-button" type="button" onClick={exportStatement}><FileText size={15} /> Export CSV</button>
          </div>
          <div className="statement-sections">
            <div className="statement-category-buttons" role="tablist" aria-label="Statement categories">
              {([
                ['bids', 'Bids'],
                ['investments', 'Investments'],
                ['loans', 'Loans'],
              ] as const).map(([category, label]) => (
                <button
                  className={`statement-category-button${statementCategory === category ? ' active' : ''}`}
                  type="button"
                  role="tab"
                  aria-selected={statementCategory === category}
                  key={category}
                  onClick={() => setStatementCategory(category)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div role="tabpanel" aria-label={`${statementCategory} statement`}>
              {statementCategory === 'bids' && renderTransactionSection('Bids', ['bid'])}
              {statementCategory === 'investments' && renderTransactionSection('Investments', ['investment', 'swap'])}
              {statementCategory === 'loans' && (
                <section className="statement-section" aria-label="Loan applications">
                  {filteredLoanApplications.length > 0 ? filteredLoanApplications.map((application) => (
                    <article className="loan-application" key={application.id}>
                      <div>
                        <strong>{currency(application.amount)}</strong>
                        <small>{application.durationMonths} months · {new Date(application.timestamp).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</small>
                      </div>
                      <span className="loan-status">{application.status}</span>
                    </article>
                  )) : <p className="statement-empty">No loan applications in this period.</p>}
                </section>
              )}
            </div>
          </div>
          <DemoNotice>Statement records reflect account activity available to this app.</DemoNotice>
        </div>
      )}

      {panel === 'p2p' && (
        <form className="account-panel-body" onSubmit={(event) => { event.preventDefault(); setComingSoonFeature('Send Money') }}>
          <label className="field-label" htmlFor="recipient">Recipient</label>
          <input id="recipient" className="form-input" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Name, email, or phone number" required />
          <label className="field-label" htmlFor="transfer-amount">Amount</label>
          <div className="currency-input"><span>KSh</span><input id="transfer-amount" type="number" min="1" step="0.01" className="form-input" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
          <div className="transfer-summary"><span>Transfer Fee</span><strong>KSh 0.00</strong><span>Total</span><strong>{currency(Number(amount) || 0)}</strong></div>
          <DemoNotice />
          <button className="primary-button full-button" type="submit">Send Money</button>
        </form>
      )}

      {panel === 'airtime' && (
        <form className="account-panel-body" onSubmit={(event) => { event.preventDefault(); setComingSoonFeature('Purchase Airtime') }}>
          <label className="field-label" htmlFor="airtime-phone">Phone Number</label>
          <input id="airtime-phone" className="form-input" type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 (555) 000-0000" required />
          <span className="field-label">Amount</span>
          <div className="amount-options">
            {['10', '20', '50', '100'].map((value) => <button type="button" key={value} onClick={() => setAmount(value)} className={amount === value ? 'selected' : ''}>KSh {value}</button>)}
          </div>
          <DemoNotice />
          <button className="primary-button full-button" type="submit">Purchase Airtime</button>
        </form>
      )}

      {panel === 'rewards' && (
        <div className="account-panel-body">
          <div className="points-card"><span>Rewards Hub</span><strong>{rewardRecords.length} <small>earned</small></strong><span>Your wins and investment offers are saved here</span></div>
          <h3 className="subsection-title">Reward History</h3>
          {rewardRecords.length > 0 ? (
            <div className="reward-history">
              {rewardRecords.map((record) => (
                <article className="reward-history-row" key={record.id}>
                  <span className={`reward-history-icon ${record.type}`}>
                    {record.type === 'auction_win' ? <Gift size={17} /> : <span>20%</span>}
                  </span>
                  <span className="reward-history-info">
                    <strong>{record.title}</strong>
                    <small>{record.detail} · {new Date(record.timestamp).toLocaleDateString()}</small>
                  </span>
                </article>
              ))}
            </div>
          ) : <p className="statement-empty">Your auction wins and investment rewards will appear here.</p>}
          <h3 className="subsection-title">Available Rewards</h3>
          <div className="reward-list">
            <div className="reward-row">
              <span className="reward-emoji">💸</span>
              <span><strong>20% off your first investment</strong><small>Applied automatically to your first successful investment</small></span>
              <strong>{firstInvestmentOfferUsed ? 'Used' : 'Available'}</strong>
            </div>
            <div className="reward-row">
              <span className="reward-emoji">👥</span>
              <span><strong>Referral commission</strong><small>20% of a verified invitee’s first investment</small></span>
              <strong>{backendMode ? 'Active' : 'Backend required'}</strong>
            </div>
          </div>
          <DemoNotice />
        </div>
      )}

      {panel === 'loans' && (
        <div className="account-panel-body">
          <form onSubmit={async (event) => {
            event.preventDefault()
            setActionSubmitting(true)
            try {
              await onApplyLoan(Number(amount), Number(duration))
              notify('Loan application submitted. Status: Pending.')
            } catch (error) {
              notify(error instanceof Error ? error.message : 'Could not submit the loan application.')
            } finally {
              setActionSubmitting(false)
            }
          }}>
            <div className="credit-card"><span>Available Credit</span><strong>KSh 10,000</strong></div>
            <label className="field-label" htmlFor="loan-amount">Loan Amount</label>
            <div className="currency-input"><span>KSh</span><input id="loan-amount" className="form-input" type="number" min="100" max="10000" step="100" value={amount} onChange={(event) => setAmount(event.target.value)} required /></div>
            <label className="field-label" htmlFor="loan-duration">Duration (months)</label>
            <select id="loan-duration" className="form-input" value={duration} onChange={(event) => setDuration(event.target.value)}><option value="6">6 months</option><option value="12">12 months</option><option value="24">24 months</option><option value="36">36 months</option></select>
            <div className="loan-summary"><div><span>Interest Rate</span><strong>5.5% APR</strong></div><div><span>Monthly Payment</span><strong>{currency(monthlyPayment)}</strong></div></div>
            <DemoNotice>{backendMode ? 'Your application is stored as Pending. No loan is issued until an administrator reviews it.' : 'Submitting creates a demo application only. No loan is issued until reviewed.'}</DemoNotice>
            <button className="primary-button full-button" type="submit" disabled={actionSubmitting}>{actionSubmitting ? 'Submitting…' : 'Apply Now'}</button>
          </form>
        </div>
      )}

      {panel === 'support' && (
        <div className="account-panel-body support-panel">
          <div className="agent-status">
            <span className="assistant-avatar"><Bot size={18} /></span>
            <span><strong>DarkNode Assistant</strong><small><span className="online-indicator" /> App help · replies instantly</small></span>
          </div>
          <div className="chat-messages" ref={chatMessagesRef} role="log" aria-live="polite" aria-label="Chat messages">
            {chatMessages.map((message) => (
              <div className={`chat-message ${message.sender}`} key={message.id}>
                {message.sender === 'assistant' && <span className="chat-message-avatar"><Bot size={14} /></span>}
                <div className="chat-message-content">
                  <p>{message.text}</p>
                  {message.timestamp !== undefined && (
                    <time dateTime={new Date(message.timestamp).toISOString()}>
                      {new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </time>
                  )}
                </div>
              </div>
            ))}
          </div>
          {chatMessages.length === 1 && (
            <div className="chat-suggestions" aria-label="Suggested questions">
              {assistantSuggestions.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => sendChatMessage(suggestion)}>{suggestion}</button>
              ))}
            </div>
          )}
          <form className="chat-form" onSubmit={(event) => { event.preventDefault(); sendChatMessage() }}>
            <input className="form-input" aria-label="Message the DarkNode assistant" value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Ask about the app..." autoComplete="off" />
            <button className="primary-button send-chat" type="submit" aria-label="Send message" disabled={!chatText.trim()}><Send size={17} /></button>
          </form>
          <p className="chat-disclosure">Automated app assistant · Demo information only, not financial advice.</p>
        </div>
      )}

      {panel === 'security' && (
        <div className="account-panel-body terms-content">
          <p className="terms-intro">Please review the terms for using the DarkNode demo app. This summary describes the current prototype and is not a formal contract or legal advice.</p>
          <section className="terms-section">
            <h3>1. Demo service</h3>
            <p>DarkNode is a demonstration interface. Supabase stores account and activity records, but no live financial, brokerage, lending, or prize service is connected.</p>
          </section>
          <section className="terms-section">
            <h3>2. Investments and market information</h3>
            <p>Stock and ETF listings and prices may be illustrative or delayed. Simulated returns are not guaranteed and must not be treated as investment advice, a recommendation, or a promise of profit.</p>
          </section>
          <section className="terms-section">
            <h3>3. Auctions and prizes</h3>
            <p>Auction bids and winner draws are stored in the account backend. No real prize is awarded, and entries do not represent participation in a real competition.</p>
          </section>
          <section className="terms-section">
            <h3>4. Payments and loan requests</h3>
            <p>M-Pesa deposits are credited only after verified provider confirmation. Withdrawals remain disabled until Safaricom-approved B2C production access is configured and require final provider confirmation. Loan applications remain pending until reviewed.</p>
          </section>
          <section className="terms-section">
            <h3>5. Local data and account access</h3>
            <p>With Supabase configured, email and password authentication is handled by Supabase Auth, while name and phone number are profile display details. Existing browser demo activity is not imported into backend accounts.</p>
          </section>
          <section className="terms-section">
            <h3>6. Availability and changes</h3>
            <p>Demo features may change or be unavailable. A future production service will require its own complete terms, privacy notice, and secure backend integrations.</p>
          </section>
          <DemoNotice>This prototype does not process real investments, payments, loans, or prize awards.</DemoNotice>
        </div>
      )}

      {panel === 'refer' && (
        <div className="account-panel-body">
          <div className="referral-hero"><span>🎁</span><strong>Earn 20% commission</strong><small>{backendMode
            ? 'On your invitee’s gross first investment. The backend records and credits it once.'
            : 'On your invitee’s gross first investment, once referral tracking is connected.'}</small></div>
          <div className="referral-code"><div><span>Your Referral Code</span><strong>{referralCode}</strong></div><button className="outline-button" type="button" onClick={async () => {
            const inviteUrl = new URL('/signup', window.location.origin)
            inviteUrl.searchParams.set('ref', referralCode)
            try {
              await navigator.clipboard.writeText(inviteUrl.toString())
              notify(backendMode
                ? 'Referral link copied. Your 20% commission is credited after your invitee makes their first backend-recorded investment.'
                : 'Referral link copied. Referral rewards require the Supabase backend.')
            } catch {
              notify('Could not copy the referral link in this browser.')
            }
          }}><Copy size={15} />Copy link</button></div>
          <button className="primary-button full-button" type="button" onClick={() => void shareReferral()}><Share2 size={16} />Invite Friends</button>
          <h3 className="subsection-title">How it works</h3>
          <div className="referral-steps">
            <p><strong>1.</strong> Share your referral link with a new user.</p>
            <p><strong>2.</strong> They sign up with your code and make their first investment.</p>
            <p><strong>3.</strong> Once verified, your reward is 20% of that first investment.</p>
          </div>
          <div className="referral-pending">
            <strong>{backendMode ? 'Referral tracking active' : 'Referral tracking not connected'}</strong>
            <span>{backendMode
              ? 'Attribution is recorded at signup. The 20% platform-funded commission is credited once when your invitee makes their first backend-recorded investment.'
              : 'This browser demo can include your code in a signup link, but it cannot verify invitees or credit commission.'}</span>
          </div>
        </div>
      )}

    </Modal>
    {comingSoonFeature && (
      <Modal title="Coming Soon" onClose={() => setComingSoonFeature(null)} className="account-modal">
        <div className="coming-soon-panel">
          <p><strong>{comingSoonFeature}</strong> will be available soon.</p>
          <DemoNotice>This feature is not connected yet. No transaction was made.</DemoNotice>
          <button className="primary-button full-button" type="button" onClick={() => setComingSoonFeature(null)}>Got it</button>
        </div>
      </Modal>
    )}
    </>
  )
}
