import { useRef, useState, type FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, RefreshCw, Smartphone, XCircle } from 'lucide-react'
import Modal from './Modal'
import DemoNotice from './DemoNotice'
import { getMpesaTransactionStatus, requestMpesaDeposit, requestMpesaWithdrawal, type MpesaTransactionStatus } from '../lib/mpesaPayments'
import { supabase } from '../lib/supabase'

type PaymentAction = 'deposit' | 'withdraw'

type MpesaPaymentModalProps = {
  action: PaymentAction
  balance: number
  balanceLoaded: boolean
  profilePhone: string
  backendMode: boolean
  onClose: () => void
  onWalletRefresh: () => Promise<void>
}

function formatKes(value: number): string {
  return new Intl.NumberFormat('en-KE', {
    style: 'currency',
    currency: 'KES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function isKenyanMobile(value: string): boolean {
  const compact = value.trim().replace(/[\s()-]/g, '')
  return /^(?:0[17]\d{8}|\+?254[17]\d{8})$/.test(compact)
}

function statusLabel(status: MpesaTransactionStatus['status']): string {
  switch (status) {
    case 'succeeded': return 'Completed'
    case 'failed': return 'Failed'
    case 'cancelled': return 'Cancelled'
    case 'timed_out': return 'Timed out'
    case 'reconciliation': return 'Under review'
    case 'submitted': return 'Processing'
    case 'reserved': return 'Processing'
    case 'initiating': return 'Starting'
    default: return 'Awaiting confirmation'
  }
}

export default function MpesaPaymentModal({
  action,
  balance,
  balanceLoaded,
  profilePhone,
  backendMode,
  onClose,
  onWalletRefresh,
}: MpesaPaymentModalProps) {
  const [amount, setAmount] = useState('')
  const [transaction, setTransaction] = useState<MpesaTransactionStatus | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [requestStarted, setRequestStarted] = useState(false)
  const idempotencyKey = useRef<string | null>(null)
  const isDeposit = action === 'deposit'

  const startPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    if (!isKenyanMobile(profilePhone)) {
      setError('Add a valid Kenyan mobile number to your account profile before continuing.')
      return
    }
    const amountKes = Number(amount)
    if (!Number.isSafeInteger(amountKes) || amountKes < 1 || amountKes > 150_000) {
      setError('Enter a whole KES amount between KES 1 and KES 150,000.')
      return
    }
    if (!isDeposit && (!balanceLoaded || amountKes > balance)) {
      setError(balanceLoaded ? 'The withdrawal amount exceeds your available balance.' : 'Your wallet balance is not available yet.')
      return
    }
    if (!backendMode || !supabase) {
      setError('Connect the authenticated Supabase account before using M-Pesa.')
      return
    }

    const requestKey = idempotencyKey.current ?? crypto.randomUUID()
    idempotencyKey.current = requestKey
    setRequestStarted(true)
    setSubmitting(true)
    try {
      const result = isDeposit
        ? await requestMpesaDeposit(supabase, amountKes, profilePhone, requestKey)
        : await requestMpesaWithdrawal(supabase, amountKes, profilePhone, requestKey)
      setTransaction({
        id: result.id,
        type: isDeposit ? 'deposit' : 'withdrawal',
        status: result.status,
        amountKes,
        currency: 'KES',
        receiptNumber: null,
        createdAt: new Date().toISOString(),
        completedAt: null,
        balance,
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not submit the M-Pesa request.')
    } finally {
      setSubmitting(false)
    }
  }

  const refreshStatus = async () => {
    if (!transaction || !supabase) return
    setChecking(true)
    setError('')
    try {
      const latest = await getMpesaTransactionStatus(supabase, transaction.id)
      setTransaction(latest)
      if (latest.status === 'succeeded' || latest.status === 'failed') {
        await onWalletRefresh()
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not check this transaction status.')
    } finally {
      setChecking(false)
    }
  }

  const resetForm = () => {
    setTransaction(null)
    setError('')
    setAmount('')
    setRequestStarted(false)
    idempotencyKey.current = null
  }

  const terminal = transaction && ['succeeded', 'failed', 'cancelled', 'timed_out'].includes(transaction.status)
  const statusIcon = transaction?.status === 'succeeded'
    ? <CheckCircle2 size={22} />
    : transaction && ['failed', 'cancelled'].includes(transaction.status)
      ? <XCircle size={22} />
      : transaction?.status === 'reconciliation'
        ? <AlertCircle size={22} />
        : <Clock3 size={22} />

  return (
    <Modal title={isDeposit ? 'Deposit Funds' : 'Withdraw Funds'} onClose={onClose} className="account-modal mpesa-payment-modal">
      <div className="account-panel-body mpesa-payment">
        <div className="available-balance">
          <span>{isDeposit ? 'Current balance' : 'Available balance'}</span>
          <strong>{balanceLoaded ? formatKes(balance) : 'Balance unavailable'}</strong>
        </div>

        {!backendMode && (
          <DemoNotice>Payments are not available in browser-demo mode. No transaction will be created.</DemoNotice>
        )}

        {!transaction && backendMode && (
          <form onSubmit={startPayment}>
            <label className="field-label" htmlFor="mpesa-payment-phone">Registered mobile number</label>
            <input
              id="mpesa-payment-phone"
              className="form-input"
              type="tel"
              autoComplete="tel"
              readOnly
              disabled={requestStarted}
              value={profilePhone === 'Not provided' ? '' : profilePhone}
              placeholder="No mobile number on your account"
            />
            <label className="field-label" htmlFor="mpesa-payment-amount">
              Amount to {isDeposit ? 'deposit' : 'withdraw'} (KES)
            </label>
            <input
              id="mpesa-payment-amount"
              className="form-input"
              type="number"
              min="1"
              max="150000"
              step="1"
              inputMode="numeric"
              required
              disabled={requestStarted}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            {error && <p className="mpesa-payment-error" role="alert"><AlertCircle size={15} />{error}</p>}
            {!isDeposit && (
              <p className="mpesa-payment-note">
                Verify the recipient number carefully. Withdrawals require Safaricom-approved B2C production access and remain pending until the provider confirms the outcome.
              </p>
            )}
            <button className="primary-button full-button" type="submit" disabled={submitting || (!isDeposit && !balanceLoaded)}>
              {submitting
                ? <><LoaderCircle className="mpesa-spinner" size={16} /> Submitting…</>
                : <><Smartphone size={16} /> {requestStarted ? 'Retry same request' : isDeposit ? 'Send M-Pesa prompt' : 'Request withdrawal'}</>}
            </button>
            {requestStarted && !transaction && (
              <p className="mpesa-payment-note">
                This retry uses the same idempotency key. Do not change the amount or start another request while the result is unknown.
              </p>
            )}
          </form>
        )}

        {transaction && (
          <div className="mpesa-payment-status">
            <span className={`mpesa-status-icon ${transaction.status}`}>{statusIcon}</span>
            <h3>{statusLabel(transaction.status)}</h3>
            <p>
              {transaction.status === 'succeeded'
                ? isDeposit ? 'The deposit was confirmed by the payment service.' : 'The withdrawal was confirmed by the payment service.'
                : transaction.status === 'reconciliation'
                  ? 'The provider result is uncertain. Funds, if reserved, remain held until reconciliation. Do not submit another withdrawal.'
                  : transaction.status === 'failed' || transaction.status === 'cancelled' || transaction.status === 'timed_out'
                    ? 'The payment was not confirmed as successful. Check your wallet history before trying again.'
                    : isDeposit
                      ? 'Approve the M-Pesa prompt on your phone. Your wallet is credited only after the server verifies the payment.'
                      : 'Your request is pending. Your available balance has not been updated optimistically.'}
            </p>
            <div className="mpesa-status-summary">
              <span>Amount</span><strong>{formatKes(transaction.amountKes)}</strong>
              <span>Reference</span><code>{transaction.id}</code>
              {transaction.receiptNumber && <><span>M-Pesa receipt</span><strong>{transaction.receiptNumber}</strong></>}
              {transaction.completedAt && <><span>Updated</span><strong>{new Date(transaction.completedAt).toLocaleString('en-KE')}</strong></>}
            </div>
            {error && <p className="mpesa-payment-error" role="alert"><AlertCircle size={15} />{error}</p>}
            {!terminal && (
              <button className="outline-button full-button" type="button" onClick={() => void refreshStatus()} disabled={checking}>
                {checking ? <><LoaderCircle className="mpesa-spinner" size={15} /> Checking…</> : <><RefreshCw size={15} /> Refresh status</>}
              </button>
            )}
            {transaction.status === 'reconciliation' && (
              <p className="mpesa-payment-note">If this status does not change, contact support with the reference above. Do not retry the request.</p>
            )}
            {terminal && transaction.status !== 'succeeded' && (
              <button className="outline-button full-button" type="button" onClick={resetForm}>Start another request</button>
            )}
            <button className="primary-button full-button" type="button" onClick={onClose}>
              {transaction.status === 'succeeded' ? 'Return to wallet' : 'Close'}
            </button>
          </div>
        )}

        {!backendMode && (
          <button className="primary-button full-button" type="button" onClick={onClose}>Close</button>
        )}
      </div>
    </Modal>
  )
}
