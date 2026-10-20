import { HttpError, jsonResponse, readJsonObject, requiredEnv, requiredEnvFrom, safeErrorResponse } from './http.ts'
import {
  callbackUrlWithToken,
  configuredInteger,
  darajaAccessToken,
  getDarajaEnvironment,
  initiateStkPush,
} from './mpesa.js'
import { normalizeKenyanPhone, readIntegerKes } from './mpesa-validation.js'
import { authenticatedUser, getAdminClient } from './supabase.ts'

export async function handleMpesaDeposit(request: Request): Promise<Response> {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, request)

  try {
    const user = await authenticatedUser(request)
    const input = await readJsonObject(request)
    const idempotencyKey = typeof input.idempotency_key === 'string'
      ? input.idempotency_key
      : request.headers.get('idempotency-key') ?? ''
    const minAmount = configuredInteger('MPESA_MIN_AMOUNT_KES', 1, 1, 150000)
    const maxAmount = configuredInteger('MPESA_MAX_AMOUNT_KES', 150000, minAmount, 150000)
    const hourlyLimit = configuredInteger('MPESA_USER_HOURLY_REQUEST_LIMIT', 3, 1, 100)
    const amount = readIntegerKes(input.amount_kes ?? input.amount, minAmount, maxAmount)
    const phone = normalizeKenyanPhone(input.phone_number ?? input.phone)

    if (Deno.env.get('MPESA_MERCHANT_CONFIG_CONFIRMED')?.trim() !== 'true') {
      throw new HttpError('STK Push is disabled until the approved Till transaction type and merchant configuration are confirmed.', 503)
    }
    const transactionType = requiredEnvFrom('MPESA_TRANSACTION_TYPE', 'MPESA_STK_TRANSACTION_TYPE')
    if (!['CustomerBuyGoodsOnline', 'CustomerPayBillOnline'].includes(transactionType)) {
      throw new HttpError('MPESA_TRANSACTION_TYPE is not supported.', 503)
    }

    const environment = getDarajaEnvironment()
    const shortcode = requiredEnv('MPESA_SHORTCODE')
    if (!/^\d{5,12}$/.test(shortcode)) throw new HttpError('MPESA_SHORTCODE configuration is invalid.', 503)
    const passkey = requiredEnv('MPESA_PASSKEY')
    const partyB = requiredEnv('MPESA_PARTY_B')
    if (!/^\d{5,12}$/.test(partyB)) throw new HttpError('MPESA_PARTY_B configuration is invalid.', 503)
    const accountReference = requiredEnv('MPESA_ACCOUNT_REFERENCE')
    if (!/^[A-Za-z0-9._-]{1,12}$/.test(accountReference)) {
      throw new HttpError('MPESA_ACCOUNT_REFERENCE must contain 1 to 12 safe characters.', 503)
    }
    const callbackUrl = callbackUrlWithToken(
      'MPESA_CALLBACK_BASE_URL',
      'MPESA_CALLBACK_URL',
      'MPESA_CALLBACK_TOKEN',
      'mpesa-callback',
    )
    const accessToken = await darajaAccessToken(environment)

    const admin = getAdminClient()
    const { data: creation, error: creationError } = await admin.rpc('begin_mpesa_deposit', {
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey,
      p_amount_kes: amount,
      p_phone_number: phone,
      p_min_amount_kes: minAmount,
      p_max_amount_kes: maxAmount,
      p_hourly_request_limit: hourlyLimit,
    })
    if (creationError) throw new HttpError(creationError.message, 400)
    const transaction = creation?.[0]
    if (!transaction) throw new Error('Deposit transaction creation returned no record.')
    if (!transaction.created) {
      return jsonResponse({
        transaction_id: transaction.transaction_id,
        status: transaction.transaction_status,
        reused: true,
      }, 202, request)
    }

    let providerResponse: Response
    let result: Record<string, unknown>
    try {
      const initiation = await initiateStkPush({
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
        transactionId: transaction.transaction_id,
      })
      providerResponse = initiation.response
      result = initiation.result
    } catch {
      const { error } = await admin.rpc('record_mpesa_deposit_initiation', {
        p_transaction_id: transaction.transaction_id,
        p_status: 'reconciliation',
        p_merchant_request_id: null,
        p_checkout_request_id: null,
        p_result_code: null,
        p_result_description: 'STK request outcome is unknown; reconcile before retrying.',
      })
      if (error) throw new Error('STK request outcome is unknown and requires reconciliation.')
      return jsonResponse({ transaction_id: transaction.transaction_id, status: 'reconciliation' }, 202, request)
    }

    const responseCode = String(result.ResponseCode ?? '')
    const checkoutRequestId = typeof result.CheckoutRequestID === 'string' ? result.CheckoutRequestID : ''
    const merchantRequestId = typeof result.MerchantRequestID === 'string' ? result.MerchantRequestID : ''

    if (!providerResponse.ok || responseCode !== '0' || !checkoutRequestId || !merchantRequestId) {
      const definitiveRejection = providerResponse.status >= 400
        && providerResponse.status < 500
        && responseCode !== ''
      const { error } = await admin.rpc('record_mpesa_deposit_initiation', {
        p_transaction_id: transaction.transaction_id,
        p_status: definitiveRejection ? 'failed' : 'reconciliation',
        p_merchant_request_id: merchantRequestId || null,
        p_checkout_request_id: checkoutRequestId || null,
        p_result_code: responseCode || null,
        p_result_description: typeof result.errorMessage === 'string'
          ? result.errorMessage.slice(0, 240)
          : typeof result.ResponseDescription === 'string'
            ? result.ResponseDescription.slice(0, 240)
            : 'STK Push was not confirmed; reconcile before retrying.',
      })
      if (error) throw new Error('STK request outcome could not be recorded; reconcile before retrying.')
      return jsonResponse({
        transaction_id: transaction.transaction_id,
        status: definitiveRejection ? 'failed' : 'reconciliation',
      }, 202, request)
    }

    const { error: recordError } = await admin.rpc('record_mpesa_deposit_initiation', {
      p_transaction_id: transaction.transaction_id,
      p_status: 'pending',
      p_merchant_request_id: merchantRequestId,
      p_checkout_request_id: checkoutRequestId,
      p_result_code: responseCode,
      p_result_description: typeof result.ResponseDescription === 'string' ? result.ResponseDescription : 'STK Push sent.',
    })
    if (recordError) {
      const { data: current, error: statusError } = await admin.rpc('get_mpesa_transaction_status', {
        p_user_id: user.id,
        p_transaction_id: transaction.transaction_id,
      })
      if (statusError) throw new Error('STK request was submitted, but its transaction status needs reconciliation.')
      const status = current?.[0]?.transaction_status
      if (status === 'succeeded' || status === 'failed' || status === 'cancelled') {
        return jsonResponse({ transaction_id: transaction.transaction_id, status }, 202, request)
      }
      throw new Error('STK request was submitted, but its provider identifiers need reconciliation.')
    }

    return jsonResponse({ transaction_id: transaction.transaction_id, status: 'pending' }, 202, request)
  } catch (error) {
    return safeErrorResponse(error, request)
  }
}
