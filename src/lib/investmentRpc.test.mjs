import assert from 'node:assert/strict'
import test from 'node:test'
import { isNetworkFetchFailure, parseAuctionBidRpcResult, parseInvestmentReturnSwapResult, parseInvestmentRpcResult, retryNetworkRead } from './backendRpc.ts'

test('retries a transient auction status network failure and returns the successful read', async () => {
  let requests = 0
  const result = await retryNetworkRead(async () => {
    requests += 1
    return requests < 2 ? { error: new TypeError('Failed to fetch') } : { data: [{ auction_id: 'watch' }], error: null }
  }, (response) => isNetworkFetchFailure(response.error))

  assert.equal(requests, 2)
  assert.deepEqual(result, { data: [{ auction_id: 'watch' }], error: null })
})

test('does not retry structured Supabase errors or unrelated exceptions', async () => {
  assert.equal(isNetworkFetchFailure({ code: 'PGRST202', message: 'Function does not exist.' }), false)
  let requests = 0
  await assert.rejects(retryNetworkRead(async () => {
    requests += 1
    throw new Error('Permission denied.')
  }, () => true), /Permission denied/)
  assert.equal(requests, 1)
})

test('converts PostgREST-shaped RPC errors into visible Error messages', () => {
  assert.throws(
    () => parseInvestmentRpcResult(null, { message: 'The asset quote is invalid or out of date.' }),
    /Investment could not be recorded: The asset quote is invalid or out of date/,
  )
})

test('includes database code, details, and hint in an investment failure', () => {
  assert.throws(
    () => parseInvestmentRpcResult(null, {
      message: 'Could not find the function in the schema cache.',
      code: 'PGRST202',
      details: 'Searched for public.buy_demo_investment.',
      hint: 'Run the latest database migration.',
    }),
    /PGRST202.*Searched for public\.buy_demo_investment.*Hint: Run the latest database migration/,
  )
})

test('rejects an empty RPC response with an actionable error', () => {
  assert.throws(
    () => parseInvestmentRpcResult([], null),
    /Supabase returned no record/,
  )
})

test('normalizes valid investment RPC response values', () => {
  assert.deepEqual(
    parseInvestmentRpcResult([{
      investment_id: 'investment-1',
      amount_charged: '800',
      discount_amount: '200',
      balance: '1200',
    }], null),
    {
      investment_id: 'investment-1',
      amount_charged: 800,
      discount_amount: 200,
      balance: 1200,
    },
  )
})

test('surfaces a Supabase bid RPC error as an actionable Error', () => {
  assert.throws(
    () => parseAuctionBidRpcResult(null, {
      message: 'Could not find the function in the schema cache.',
      code: 'PGRST202',
      hint: 'Run the latest database migration.',
    }),
    /Your bid could not be recorded: Could not find the function in the schema cache.*PGRST202.*Hint: Run the latest database migration/,
  )
})

test('rejects an empty bid RPC response instead of treating it as success', () => {
  assert.throws(
    () => parseAuctionBidRpcResult([], null),
    /Your bid could not be recorded: Supabase returned no record/,
  )
})

test('normalizes valid bid RPC response values', () => {
  assert.deepEqual(
    parseAuctionBidRpcResult([{
      entry_amount: '75',
      winner_name: null,
      new_round: 1,
      balance: '925',
      entry_count: 2,
      total_amount: '150',
      last_amount: '75',
      next_amount: '80',
    }], null),
    {
      entry_amount: 75,
      winner_name: null,
      new_round: 1,
      balance: 925,
      entry_count: 2,
      total_amount: 150,
      last_amount: 75,
      next_amount: 80,
    },
  )
})

test('parses a successful investment return swap', () => {
  assert.deepEqual(
    parseInvestmentReturnSwapResult([{ amount_swapped: '12.34', balance: '1012.34' }], null),
    { amount_swapped: 12.34, balance: 1012.34 },
  )
})

test('rejects an invalid investment return swap response', () => {
  assert.throws(
    () => parseInvestmentReturnSwapResult([{ amount_swapped: -5, balance: 100 }], null),
    /Investment returns could not be swapped: Supabase returned an invalid record/,
  )
})

test('explains when the swap RPC migration is missing', () => {
  assert.throws(
    () => parseInvestmentReturnSwapResult(null, {
      message: 'Could not find the function in the schema cache.',
      code: 'PGRST202',
    }),
    /Apply .*202610190003_investment_return_swap\.sql in the Supabase SQL Editor/,
  )
})
