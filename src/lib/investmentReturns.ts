import type { Holding } from '../types'

const dayMs = 24 * 60 * 60 * 1000
export const investmentLifespanMs = 30 * dayMs

export type InvestmentReturn = {
  investedValue: number
  targetPercent: number
  currentPercent: number
  dailyProgressPercent: number
  claimableGain: number
  dayNumber: number
  daysElapsed: number
  remainingMs: number
}

function dailyTargetPercent(investment: Holding): number {
  if (
    typeof investment.dailyReturnPercent === 'number'
    && Number.isFinite(investment.dailyReturnPercent)
    && investment.dailyReturnPercent >= 9
    && investment.dailyReturnPercent <= 12
  ) return investment.dailyReturnPercent

  const identity = investment.investmentId
    ?? `${investment.symbol}:${investment.startedAt ?? investment.expiresAt ?? 0}`
  let hash = 2166136261
  for (const character of identity) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  }
  return 9 + (hash >>> 0) % 3001 / 1000
}

export function calculateInvestmentReturn(investment: Holding, now: number): InvestmentReturn {
  const startedAt = investment.startedAt ?? now
  const expiresAt = investment.expiresAt ?? startedAt + investmentLifespanMs
  const lifespanMs = Math.max(0, expiresAt - startedAt)
  const elapsedMs = Math.min(lifespanMs, Math.max(0, now - startedAt))
  const targetPercent = dailyTargetPercent(investment)
  const daysElapsed = Math.floor(elapsedMs / dayMs)
  const dailyProgressPercent = targetPercent * (elapsedMs % dayMs) / dayMs
  const currentPercent = targetPercent * elapsedMs / dayMs
  const earned = investment.value * currentPercent / 100
  const returnsPaid = Number.isFinite(investment.returnsPaid) ? investment.returnsPaid ?? 0 : 0

  return {
    investedValue: investment.value,
    targetPercent,
    currentPercent,
    dailyProgressPercent,
    claimableGain: Math.max(0, Math.round((earned - returnsPaid) * 100) / 100),
    dayNumber: Math.min(Math.floor(lifespanMs / dayMs), daysElapsed + 1),
    daysElapsed,
    remainingMs: Math.max(0, expiresAt - now),
  }
}
