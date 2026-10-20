import { HttpError, booleanEnv, handleOptions, jsonResponse, readJsonObject, requirePost, safeErrorResponse, requiredEnv, requiredEnvFrom } from '../_shared/http.ts'
import {
  callbackUrlWithToken,
  configuredInteger,
  darajaAccessToken,
  getDarajaEnvironment,
  initiateB2cPayment,
  normalizeKenyanPhone,
  readIntegerKes,
} from '../_shared/mpesa.js'
import { authenticatedUser, getAdminClient } from '../_shared/supabase.ts'

function requireB2cApproval(): void {
  if (!booleanEnv('MPESA_B2C_ENABLED')
    || !booleanEnv('MPESA_B2C_APPROVAL_CONFIRMED')
    || !booleanEnv('MPESA_PRODUCTION_ENABLED')) {
    throw new HttpError('M-Pesa withdrawals are disabled until B2C production access and disbursement approval are confirmed.', 503)
  }
  if (getDarajaEnvironment() !== 'production') {
    throw new HttpError('B2C withdrawals are only enabled for an explicitly approved production account.', 503)
  }
}

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options) return options
  const methodError = requirePost(request)
  if (methodError) return methodError
  try {
    const user = await authenticatedUser(request)
    const input = await readJsonObject(request)
    const idempotencyKey = request.headers.get('idempotency-key') ?? ''
    const minAmount = configuredInteger('MPESA_MIN_AMOUNT_KES', 1, 1, 150000)
    const maxAmount = configuredInteger('MPESA_MAX_WITHDRAWAL_KES', 150000, minAmount, 150000)
    const hourlyLimit = configuredInteger('MPESA_USER_HOURLY_REQUEST_LIMIT', 3, 1, 100)
    const amount = readIntegerKes(input.amount_kes ?? input.amount, minAmount, maxAmount)
    const phone = normalizeKenyanPhone(input.phone_number ?? input.phone)

    requireB2cApproval()
    const commandId = requiredEnv('MPESA_B2C_COMMAND_ID')
    if (!['BusinessPayment', 'SalaryPayment', 'PromotionPayment'].includes(commandId)) {
      throw new HttpError('MPESA_B2C_COMMAND_ID is not an approved command.', 503)
    }
    const initiatorName = requiredEnvFrom('MPESA_INITIATOR_NAME', 'MPESA_B2C_INITIATOR_NAME')
    const securityCredential = requiredEnvFrom('MPESA_SECURITY_CREDENTIAL', 'MPESA_B2C_SECURITY_CREDENTIAL')
    const shortcode = requiredEnv('MPESA_B2C_SHORTCODE')
    const resultUrl = callbackUrlWithToken(
      'MPESA_CALLBACK_BASE_URL',
      'MPESA_B2C_RESULT_URL',
      'MPESA_B2C_RESULT_TOKEN',
      'mpesa-b2c-result',
    )
    const timeoutUrl = callbackUrlWithToken(
      'MPESA_CALLBACK_BASE_URL',
      'MPESA_B2C_TIMEOUT_URL',
      'MPESA_B2C_TIMEOUT_TOKEN',
      'mpesa-b2c-timeout',
    )

    const accessToken = await darajaAccessToken('production')
    const admin = getAdminClient()
    const { data: reservation, error: reserveError } = await admin.rpc('reserve_mpesa_withdrawal', {
      p_user_id: user.id,
      p_idempotency_key: idempotencyKey,
      p_amount_kes: amount,
      p_phone_number: phone,
      p_min_amount_kes: minAmount,
      p_max_amount_kes: maxAmount,
      p_hourly_request_limit: hourlyLimit,
    })
    if (reserveError) throw new HttpError(reserveError.message, 400)
    const transaction = reservation?.[0]
    if (!transaction) throw new Error('Withdrawal reservation returned no record.')
    if (!transaction.created) {
      return jsonResponse({
        transaction_id: transaction.transaction_id,
        status: transaction.transaction_status,
        balance: transaction.wallet_balance,
        reused: true,
      }, 202, request)
    }

    let response: Response
    let result: Record<string, unknown>
    try {
      const initiation = await initiateB2cPayment({
        accessToken,
        shortcode,
        initiatorName,
        securityCredential,
        commandId,
        amount,
        phone,
        resultUrl,
        timeoutUrl,
        transactionId: transaction.transaction_id,
      })
      response = initiation.response
      result = initiation.result
    } catch {
      const { error: uncertainError } = await admin.rpc('record_mpesa_withdrawal_submission', {
        p_transaction_id: transaction.transaction_id,
        p_status: 'reconciliation',
        p_originator_conversation_id: null,
        p_conversation_id: null,
        p_result_code: null,
        p_result_description: 'Payout submission outcome is unknown; funds remain reserved for reconciliation.',
      })
      if (uncertainError) throw new Error('Payout submission outcome is unknown; funds remain reserved for reconciliation.')
      return jsonResponse({
        transaction_id: transaction.transaction_id,
        status: 'reconciliation',
        balance: transaction.wallet_balance,
      }, 202, request)
    }

    const responseCode = String(result.ResponseCode ?? '')
    const originatorId = typeof result.OriginatorConversationID === 'string' ? result.OriginatorConversationID : ''
    const conversationId = typeof result.ConversationID === 'string' ? result.ConversationID : ''
    if (response.ok && responseCode === '0' && originatorId && conversationId) {
      const { error } = await admin.rpc('record_mpesa_withdrawal_submission', {
        p_transaction_id: transaction.transaction_id,
        p_status: 'submitted',
        p_originator_conversation_id: originatorId,
        p_conversation_id: conversationId,
        p_result_code: responseCode,
        p_result_description: typeof result.ResponseDescription === 'string' ? result.ResponseDescription : 'Payout submitted.',
      })
      if (error) throw new Error('Payout was submitted but its provider IDs need reconciliation.')
      return jsonResponse({
        transaction_id: transaction.transaction_id,
        status: 'submitted',
        balance: transaction.wallet_balance,
      }, 202, request)
    }

    const definitePreSubmissionRejection = response.status >= 400
      && response.status < 500
      && ['400', '401', '403'].includes(String(response.status))
      && responseCode !== ''
    if (definitePreSubmissionRejection) {
      const { data, error } = await admin.rpc('finalize_mpesa_withdrawal', {
        p_transaction_id: transaction.transaction_id,
        p_status: 'failed',
        p_originator_conversation_id: originatorId || null,
        p_conversation_id: conversationId || null,
        p_amount_kes: amount,
        p_receipt_number: null,
        p_provider_result_code: responseCode,
        p_provider_result_description: typeof result.errorMessage === 'string' ? result.errorMessage : 'Daraja rejected the payout before submission.',
        p_provider_verified: true,
      })
      if (error) throw error
      return jsonResponse({
        transaction_id: transaction.transaction_id,
        status: data?.[0]?.transaction_status ?? 'reconciliation',
        balance: data?.[0]?.wallet_balance ?? transaction.wallet_balance,
      }, 202, request)
    }

    const { error: uncertainError } = await admin.rpc('record_mpesa_withdrawal_submission', {
      p_transaction_id: transaction.transaction_id,
      p_status: 'reconciliation',
      p_originator_conversation_id: originatorId || null,
      p_conversation_id: conversationId || null,
      p_result_code: responseCode || null,
      p_result_description: 'Payout outcome is uncertain; funds remain reserved pending reconciliation.',
    })
    if (uncertainError) throw new Error('Payout outcome is uncertain and funds remain reserved for reconciliation.')
    return jsonResponse({
      transaction_id: transaction.transaction_id,
      status: 'reconciliation',
      balance: transaction.wallet_balance,
    }, 202, request)
  } catch (error) {
    return safeErrorResponse(error, request)
  }
})
