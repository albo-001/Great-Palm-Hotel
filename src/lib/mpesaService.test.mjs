import assert from 'node:assert/strict'
import test from 'node:test'
import {
  darajaAccessToken,
  darajaBaseUrl,
  getDarajaEnvironment,
  initiateB2cPayment,
  initiateStkPush,
} from '../../supabase/functions/_shared/mpesa.js'
import { HttpError } from '../../supabase/functions/_shared/http.ts'

const originalDeno = globalThis.Deno
const secrets = new Map()
globalThis.Deno = { env: { get: (name) => secrets.get(name) } }
test.after(() => {
  if (originalDeno === undefined) delete globalThis.Deno
  else globalThis.Deno = originalDeno
})

test('selects sandbox/production endpoints and requires explicit production enablement', () => {
  secrets.set('MPESA_ENV', 'sandbox')
  assert.equal(getDarajaEnvironment(), 'sandbox')
  assert.equal(darajaBaseUrl('sandbox'), 'https://sandbox.safaricom.co.ke')
  assert.equal(darajaBaseUrl('production'), 'https://api.safaricom.co.ke')

  secrets.set('MPESA_ENV', 'production')
  secrets.delete('MPESA_PRODUCTION_ENABLED')
  assert.throws(() => getDarajaEnvironment(), /Production M-Pesa is disabled/)
  assert.equal(getDarajaEnvironment(true), 'production')
})

test('requests OAuth tokens with server-side credentials and safe provider failures', async () => {
  secrets.set('MPESA_CONSUMER_KEY', 'sandbox-key')
  secrets.set('MPESA_CONSUMER_SECRET', 'sandbox-secret')
  let captured
  const token = await darajaAccessToken('sandbox', async (url, options) => {
    captured = { url, options }
    return Response.json({ access_token: 'mock-token' })
  })

  assert.equal(token, 'mock-token')
  assert.equal(captured.url, 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials')
  assert.equal(captured.options.headers.Authorization, `Basic ${btoa('sandbox-key:sandbox-secret')}`)
  await assert.rejects(
    darajaAccessToken('production', async () => new Response('{}', { status: 401 })),
    (error) => error instanceof HttpError && /authentication failed/.test(error.message),
  )
})

test('creates a Till STK Push with the expected password, transaction type, amount, and callbacks', async () => {
  let captured
  const { response, result } = await initiateStkPush({
    environment: 'sandbox',
    accessToken: 'mock-token',
    shortcode: '174379',
    passkey: 'mock-passkey',
    transactionType: 'CustomerBuyGoodsOnline',
    amount: 500,
    phone: '254712345678',
    partyB: '174379',
    callbackUrl: 'https://project.supabase.co/functions/v1/mpesa-callback?token=mock',
    accountReference: 'DarkNode',
    transactionId: 'transaction-1',
  }, async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) }
    return Response.json({
      ResponseCode: '0',
      CheckoutRequestID: 'ws_CO_mock',
      MerchantRequestID: 'merchant_mock',
    })
  })

  assert.equal(response.status, 200)
  assert.equal(result.CheckoutRequestID, 'ws_CO_mock')
  assert.equal(captured.url, 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest')
  assert.equal(captured.options.headers.Authorization, 'Bearer mock-token')
  assert.equal(captured.body.TransactionType, 'CustomerBuyGoodsOnline')
  assert.equal(captured.body.Amount, 500)
  assert.equal(captured.body.PartyA, '254712345678')
  assert.equal(captured.body.PartyB, '174379')
  assert.equal(captured.body.CallBackURL, 'https://project.supabase.co/functions/v1/mpesa-callback?token=mock')
  assert.match(captured.body.Timestamp, /^\d{14}$/)
  assert.equal(captured.body.Password, btoa(`174379mock-passkey${captured.body.Timestamp}`))
})

test('constructs a B2C payout request without any automatic retry', async () => {
  let captured
  const { response, result } = await initiateB2cPayment({
    accessToken: 'production-token',
    shortcode: '123456',
    initiatorName: 'approved-initiator',
    securityCredential: 'encrypted-credential',
    commandId: 'BusinessPayment',
    amount: 250,
    phone: '254712345678',
    resultUrl: 'https://project.supabase.co/functions/v1/mpesa-b2c-result?token=result',
    timeoutUrl: 'https://project.supabase.co/functions/v1/mpesa-b2c-timeout?token=timeout',
    transactionId: 'transaction-2',
  }, async (url, options) => {
    captured = { url, options, body: JSON.parse(options.body) }
    return Response.json({ ResponseCode: '0', ConversationID: 'conversation-2' })
  })

  assert.equal(response.status, 200)
  assert.equal(result.ResponseCode, '0')
  assert.equal(captured.url, 'https://api.safaricom.co.ke/mpesa/b2c/v3/paymentrequest')
  assert.equal(captured.body.CommandID, 'BusinessPayment')
  assert.equal(captured.body.Amount, 250)
  assert.equal(captured.body.PartyB, '254712345678')
  assert.equal(captured.body.ResultURL, 'https://project.supabase.co/functions/v1/mpesa-b2c-result?token=result')
})
