type RpcError = {
  message?: string
  code?: string
  details?: string
  hint?: string
} | null

export function isNetworkFetchFailure(error: unknown): boolean {
  if (error instanceof TypeError) return /fetch|network/i.test(error.message)
  if (typeof error !== 'object' || error === null) return false
  const value = error as { name?: unknown; message?: unknown }
  return value.name === 'TypeError'
    && typeof value.message === 'string'
    && /fetch|network/i.test(value.message)
}

export async function retryNetworkRead<T>(
  request: () => PromiseLike<T>,
  hasNetworkFailure: (result: T) => boolean,
): Promise<T> {
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const result = await request()
      if (!hasNetworkFailure(result) || attempt === maxAttempts - 1) return result
    } catch (error) {
      if (!isNetworkFetchFailure(error) || attempt === maxAttempts - 1) throw error
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 300 * (attempt + 1)))
  }
  throw new Error('Auction status request stopped before completion.')
}

function throwRpcError(error: RpcError, operation: string): void {
  if (error) {
    const diagnostics = [
      error.message,
      error.code ? `code ${error.code}` : null,
      error.details,
      error.hint ? `Hint: ${error.hint}` : null,
    ].filter((value): value is string => Boolean(value))
    throw new Error(`${operation}: ${diagnostics.join(' — ') || 'Supabase RPC failed.'}`)
  }
}

function firstRpcRow(data: unknown, operation: string): Record<string, unknown> {
  const row = Array.isArray(data) ? data[0] : null
  if (typeof row !== 'object' || row === null) {
    throw new Error(`${operation}: Supabase returned no record.`)
  }
  return row as Record<string, unknown>
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function parseInvestmentRpcResult(
  data: unknown,
  error: RpcError,
): { investment_id: string; amount_charged: number; discount_amount: number; balance: number } {
  const operation = 'Investment could not be recorded'
  throwRpcError(error, operation)
  const row = firstRpcRow(data, operation)
  const amountCharged = finiteNumber(row.amount_charged)
  const discountAmount = finiteNumber(row.discount_amount)
  const balance = finiteNumber(row.balance)
  if (
    typeof row.investment_id !== 'string'
    || amountCharged === null
    || discountAmount === null
    || balance === null
  ) {
    throw new Error(`${operation}: Supabase returned an invalid record.`)
  }

  return {
    investment_id: row.investment_id,
    amount_charged: amountCharged,
    discount_amount: discountAmount,
    balance,
  }
}

export function parseAuctionBidRpcResult(
  data: unknown,
  error: RpcError,
): {
  entry_amount: number
  winner_name: string | null
  new_round: number
  balance: number
  entry_count: number
  total_amount: number
  last_amount: number | null
  next_amount: number
} {
  const operation = 'Your bid could not be recorded'
  throwRpcError(error, operation)
  const row = firstRpcRow(data, operation)
  const entryAmount = finiteNumber(row.entry_amount)
  const newRound = finiteNumber(row.new_round)
  const balance = finiteNumber(row.balance)
  const entryCount = finiteNumber(row.entry_count)
  const totalAmount = finiteNumber(row.total_amount)
  const lastAmount = row.last_amount === null ? null : finiteNumber(row.last_amount)
  const nextAmount = finiteNumber(row.next_amount)
  if (
    entryAmount === null
    || (row.winner_name !== null && typeof row.winner_name !== 'string')
    || newRound === null
    || balance === null
    || entryCount === null
    || totalAmount === null
    || (row.last_amount !== null && lastAmount === null)
    || nextAmount === null
  ) {
    throw new Error(`${operation}: Supabase returned an invalid record.`)
  }

  return {
    entry_amount: entryAmount,
    winner_name: row.winner_name,
    new_round: newRound,
    balance,
    entry_count: entryCount,
    total_amount: totalAmount,
    last_amount: lastAmount,
    next_amount: nextAmount,
  }
}

export function parseInvestmentReturnSwapResult(
  data: unknown,
  error: RpcError,
): { amount_swapped: number; balance: number } {
  const operation = 'Investment returns could not be swapped'
  if (error && ['42703', '42883', 'PGRST202'].includes(error.code ?? '')) {
    throw new Error(
      `${operation}: the Supabase database is missing the swap RPC or investment returns schema. Apply supabase/migrations/202610190003_investment_return_swap.sql in the Supabase SQL Editor, then try again.`,
    )
  }
  throwRpcError(error, operation)
  const row = firstRpcRow(data, operation)
  const amountSwapped = finiteNumber(row.amount_swapped)
  const balance = finiteNumber(row.balance)
  if (amountSwapped === null || amountSwapped < 0 || balance === null) {
    throw new Error(`${operation}: Supabase returned an invalid record.`)
  }
  return { amount_swapped: amountSwapped, balance }
}
