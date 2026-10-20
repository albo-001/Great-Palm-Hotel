import assert from 'node:assert/strict'
import test from 'node:test'
import { getMpesaTransactionStatus, requestMpesaDeposit, requestMpesaWithdrawal } from './mpesaPayments.ts'

function mockClient({ session = { access_token: 'user-session-token' }, response, invokeError, invokeReject } = {}) {
  const calls = []
  return {
    calls,
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
    },
    functions: {
      invoke: async (...args) => {
        calls.push(args)
        if (invokeReject) throw invokeReject
        return { data: response, error: invokeError ?? null }
      },
    },
  }
}

test('calls the deployed function with the backend STK contract and returns pending, not completed', async () => {
  const client = mockClient({
    response: { transaction_id: 'tx-1', status: 'pending' },
  })

  const result = await requestMpesaDeposit(client, 100, '07XX XXX XXX')

  assert.deepEqual(result, { id: 'tx-1', status: 'pending' })
  assert.equal(client.calls.length, 1)
  const [slug, options] = client.calls[0]
  assert.equal(slug, 'mpesa-deposit')
  const { idempotency_key, ...requestBody } = options.body
  assert.deepEqual(requestBody, {
    phone_number: '07XX XXX XXX',
    amount_kes: 100,
  })
  assert.match(idempotency_key, /^[\da-f-]{36}$/i)
  assert.equal('headers' in options, false)
})

test('rejects when there is no signed-in session without invoking the function', async () => {
  const client = mockClient({ session: null })

  await assert.rejects(
    requestMpesaDeposit(client, 100, '254712345678'),
    /Sign in to Supabase/,
  )
  assert.equal(client.calls.length, 0)
})

test('rejects invalid whole-KES amounts before invoking the function', async () => {
  const client = mockClient({ response: { transaction_id: 'not-used', status: 'pending' } })

  await assert.rejects(requestMpesaDeposit(client, 100.5, '254712345678'), /whole KES amount/)
  assert.equal(client.calls.length, 0)
})

test('surfaces backend HTTP errors from the invocation response body', async () => {
  const previousError = console.error
  const diagnostics = []
  console.error = (...args) => diagnostics.push(args)
  const client = mockClient({
    invokeError: {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(JSON.stringify({ error: 'Merchant configuration is not confirmed for phone 254712345678.' }), { status: 503 }),
    },
  })

  try {
    await assert.rejects(
      requestMpesaDeposit(client, 100, '254712345678'),
      /Merchant configuration is not confirmed/,
    )
  } finally {
    console.error = previousError
  }
  assert.equal(diagnostics[0][1].type, 'FunctionsHttpError')
  assert.equal(diagnostics[0][1].status, 503)
  assert.match(diagnostics[0][1].responseBody.error, /\[redacted phone\]/)
  assert.doesNotMatch(JSON.stringify(diagnostics), /254712345678/)
})

test('surfaces an application error in a 200 response body', async () => {
  const client = mockClient({ response: { error: 'Deposit validation failed.' } })

  await assert.rejects(requestMpesaDeposit(client, 100, '254712345678'), /Deposit validation failed/)
})

test('surfaces network failures without converting them into success', async () => {
  const previousError = console.error
  const diagnostics = []
  console.error = (...args) => diagnostics.push(args)
  const client = mockClient({
    invokeReject: {
      name: 'FunctionsFetchError',
      message: 'Failed to send a request to the Edge Function.',
      context: new TypeError('Failed to fetch'),
    },
  })

  try {
    await assert.rejects(requestMpesaDeposit(client, 100, '254712345678'), /Failed to send a request/)
  } finally {
    console.error = previousError
  }
  assert.equal(diagnostics[0][1].type, 'FunctionsFetchError')
  assert.equal(diagnostics[0][1].cause.name, 'TypeError')
  assert.equal(diagnostics[0][1].cause.message, 'Failed to fetch')
})

test('identifies relay errors distinctly', async () => {
  const previousError = console.error
  const diagnostics = []
  console.error = (...args) => diagnostics.push(args)
  const client = mockClient({
    invokeError: {
      name: 'FunctionsRelayError',
      message: 'Relay failed.',
    },
  })

  try {
    await assert.rejects(requestMpesaDeposit(client, 100, '254712345678'), /Relay failed/)
  } finally {
    console.error = previousError
  }
  assert.equal(diagnostics[0][1].type, 'FunctionsRelayError')
})

test('submits withdrawals with an idempotency key and no browser-side server secret', async () => {
  const client = mockClient({
    response: { transaction_id: '4a95a449-0b19-4c39-a10a-8cc69ee05a55', status: 'submitted' },
  })
  const idempotencyKey = 'same-request-key-0001'

  const result = await requestMpesaWithdrawal(client, 250, '0712345678', idempotencyKey)

  assert.deepEqual(result, { id: '4a95a449-0b19-4c39-a10a-8cc69ee05a55', status: 'submitted' })
  assert.equal(client.calls[0][0], 'mpesa-withdrawal')
  assert.deepEqual(client.calls[0][1], {
    body: { amount_kes: 250, phone_number: '0712345678' },
    headers: { 'idempotency-key': idempotencyKey },
  })
})

test('loads only a valid transaction status response for the requested transaction', async () => {
  const id = '4a95a449-0b19-4c39-a10a-8cc69ee05a55'
  const client = mockClient({
    response: {
      transaction_id: id,
      transaction_type: 'deposit',
      status: 'succeeded',
      amount_kes: 100,
      currency: 'KES',
      receipt_number: 'QWE12345',
      created_at: '2026-10-20T00:00:00Z',
      completed_at: '2026-10-20T00:01:00Z',
      balance: 1100,
    },
  })

  assert.deepEqual(await getMpesaTransactionStatus(client, id), {
    id,
    type: 'deposit',
    status: 'succeeded',
    amountKes: 100,
    currency: 'KES',
    receiptNumber: 'QWE12345',
    createdAt: '2026-10-20T00:00:00Z',
    completedAt: '2026-10-20T00:01:00Z',
    balance: 1100,
  })
  assert.equal(client.calls[0][0], 'transaction-status')
})

test('does not invoke status endpoint for malformed or cross-transaction response IDs', async () => {
  const client = mockClient({
    response: { transaction_id: 'other', transaction_type: 'deposit', status: 'succeeded' },
  })
  await assert.rejects(
    getMpesaTransactionStatus(client, '4a95a449-0b19-4c39-a10a-8cc69ee05a55'),
    /invalid transaction status/,
  )
})
