import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateInvestmentReturn, investmentLifespanMs } from './investmentReturns.ts'

const dayMs = 24 * 60 * 60 * 1000
const startedAt = Date.UTC(2026, 0, 1)
const purchase = {
  symbol: 'AAPL',
  company: 'Apple',
  percent: 0,
  shares: 1,
  value: 1000,
  gain: 0,
  investmentId: 'stable-investment-id',
  startedAt,
  expiresAt: startedAt + investmentLifespanMs,
}

test('starts at zero and accrues half the daily target over the first 12 hours', () => {
  const start = calculateInvestmentReturn(purchase, startedAt)
  const after12Hours = calculateInvestmentReturn(purchase, startedAt + dayMs / 2)

  assert.equal(start.currentPercent, 0)
  assert.equal(start.investedValue, purchase.value)
  assert.equal(start.dailyProgressPercent, 0)
  assert.ok(start.targetPercent >= 9 && start.targetPercent <= 12)
  assert.equal(after12Hours.currentPercent, start.targetPercent / 2)
  assert.equal(after12Hours.dailyProgressPercent, start.targetPercent / 2)
  assert.equal(after12Hours.dayNumber, 1)
})

test('completes one daily target after 24 hours and begins the next daily cycle', () => {
  const after24Hours = calculateInvestmentReturn(purchase, startedAt + dayMs)

  assert.equal(after24Hours.currentPercent, after24Hours.targetPercent)
  assert.equal(after24Hours.dailyProgressPercent, 0)
  assert.equal(after24Hours.daysElapsed, 1)
  assert.equal(after24Hours.dayNumber, 2)
})

test('caps accrual at the end of the 30-day investment lifespan', () => {
  const afterExpiry = calculateInvestmentReturn(purchase, purchase.expiresAt + dayMs)

  assert.equal(afterExpiry.currentPercent, afterExpiry.targetPercent * 30)
  assert.equal(afterExpiry.dayNumber, 30)
  assert.equal(afterExpiry.remainingMs, 0)
})

test('keeps a purchase daily target stable across refreshes', () => {
  const initial = calculateInvestmentReturn(purchase, startedAt)
  const refreshed = calculateInvestmentReturn(purchase, startedAt + 7 * dayMs)

  assert.equal(initial.targetPercent, refreshed.targetPercent)
})

test('shows only unclaimed returns as total gain after a swap', () => {
  const fullDayGain = purchase.value * calculateInvestmentReturn(purchase, startedAt + dayMs).targetPercent / 100
  const partiallyClaimed = {
    ...purchase,
    returnsPaid: Math.round(fullDayGain / 2 * 100) / 100,
  }
  const returns = calculateInvestmentReturn(partiallyClaimed, startedAt + dayMs)

  assert.equal(returns.investedValue, purchase.value)
  assert.equal(returns.claimableGain, Math.round((fullDayGain - partiallyClaimed.returnsPaid) * 100) / 100)
})
