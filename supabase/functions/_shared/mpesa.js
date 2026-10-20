import { HttpError, requiredEnv } from './http.ts'
import {
  asRecord,
  darajaTimestamp,
  configuredInteger,
  normalizeKenyanPhone,
  readIntegerKes,
  safeProviderDescription,
  stkPassword,
  timingSafeEquals,
} from './mpesa-validation.js'

export function getDarajaEnvironment(allowExistingProductionCallbacks = false) {
  const value = Deno.env.get('MPESA_ENV')?.trim().toLowerCase()
  if (value !== 'sandbox' && value !== 'production') {
    throw new HttpError('MPESA_ENV must be explicitly set to sandbox or production.', 503)
  }
  if (value === 'production'
    && !allowExistingProductionCallbacks
    && Deno.env.get('MPESA_PRODUCTION_ENABLED')?.trim() !== 'true') {
    throw new HttpError('Production M-Pesa is disabled until production approval is confirmed.', 503)
  }
  return value
}

export function darajaBaseUrl(environment) {
  return environment === 'sandbox'
    ? 'https://sandbox.safaricom.co.ke'
    : 'https://api.safaricom.co.ke'
}

export async function darajaAccessToken(environment, fetchImpl = fetch) {
  const credentials = btoa(`${requiredEnv('MPESA_CONSUMER_KEY')}:${requiredEnv('MPESA_CONSUMER_SECRET')}`)
  const response = await fetchImpl(`${darajaBaseUrl(environment)}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new HttpError('Safaricom authentication failed. Check the server-side Daraja credentials.', 502)
  const result = asRecord(await response.json())
  if (typeof result?.access_token !== 'string' || !result.access_token) {
    throw new HttpError('Safaricom returned an invalid authentication response.', 502)
  }
  return result.access_token
}

export async function initiateStkPush({
  environment,
  accessToken,
  shortcode,
  passkey,
  transactionType,
  amount,
  phone,
  partyB,
  callbackUrl,
  accountReference,
  transactionId,
}, fetchImpl = fetch) {
  const timestamp = darajaTimestamp()
  const response = await fetchImpl(`${darajaBaseUrl(environment)}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: stkPassword(shortcode, passkey, timestamp),
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: amount,
      PartyA: phone,
      PartyB: partyB,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: `DarkNode wallet deposit ${transactionId}`,
    }),
    signal: AbortSignal.timeout(25_000),
  })
  const result = asRecord(await response.json().catch(() => null)) ?? {}
  return { response, result }
}

export async function initiateB2cPayment({
  accessToken,
  shortcode,
  initiatorName,
  securityCredential,
  commandId,
  amount,
  phone,
  resultUrl,
  timeoutUrl,
  transactionId,
}, fetchImpl = fetch) {
  const response = await fetchImpl(`${darajaBaseUrl('production')}/mpesa/b2c/v3/paymentrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      OriginatorConversationID: transactionId,
      InitiatorName: initiatorName,
      SecurityCredential: securityCredential,
      CommandID: commandId,
      Amount: amount,
      PartyA: shortcode,
      PartyB: phone,
      Remarks: `DarkNode withdrawal ${transactionId}`,
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: 'Wallet withdrawal',
    }),
    signal: AbortSignal.timeout(25_000),
  })
  const result = asRecord(await response.json().catch(() => null)) ?? {}
  return { response, result }
}

export function callbackUrlWithToken(baseName, legacyUrlName, tokenName, endpointName) {
  const configuredBase = Deno.env.get(baseName)?.trim()
  const configuredLegacyUrl = Deno.env.get(legacyUrlName)?.trim()
  const configuredUrl = configuredBase || configuredLegacyUrl
  if (!configuredUrl) throw new HttpError(`Server configuration is missing ${baseName}.`, 503)
  const url = new URL(configuredUrl)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new HttpError(`${baseName} must be a valid HTTPS URL.`, 503)
  }
  const requiredPath = `/functions/v1/${endpointName}`
  if (configuredBase && url.pathname.replace(/\/+$/, '').endsWith('/functions/v1')) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/${endpointName}`
  }
  if (!url.pathname.endsWith(requiredPath)) {
    throw new HttpError(`${baseName} must point to the deployed ${endpointName} function.`, 503)
  }
  url.searchParams.set('token', requiredEnv(tokenName))
  return url.toString()
}

export function verifyCallbackToken(request, tokenName) {
  const supplied = new URL(request.url).searchParams.get('token') ?? ''
  const expected = requiredEnv(tokenName)
  if (!timingSafeEquals(supplied, expected)) throw new HttpError('Callback authorization failed.', 401)
}

export async function stkQuery(checkoutRequestId, allowExistingProductionCallbacks = false, fetchImpl = fetch) {
  const environment = getDarajaEnvironment(allowExistingProductionCallbacks)
  const shortcode = requiredEnv('MPESA_SHORTCODE')
  const timestamp = darajaTimestamp()
  const accessToken = await darajaAccessToken(environment)
  const response = await fetchImpl(`${darajaBaseUrl(environment)}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: stkPassword(shortcode, requiredEnv('MPESA_PASSKEY'), timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new HttpError('Safaricom could not verify this STK payment yet.', 502)
  return asRecord(await response.json()) ?? {}
}

export {
  asRecord,
  configuredInteger,
  darajaTimestamp,
  normalizeKenyanPhone,
  readIntegerKes,
  safeProviderDescription,
  stkPassword,
  timingSafeEquals,
}
