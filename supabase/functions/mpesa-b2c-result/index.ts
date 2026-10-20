import { booleanEnv, handleOptions, HttpError, jsonResponse, safeErrorResponse, verifyCallbackToken } from '../_shared/http.ts'
import { asRecord } from '../_shared/mpesa.js'
import { getAdminClient } from '../_shared/supabase.ts'

function resultParameters(value: unknown): Record<string, unknown> {
  const result = asRecord(value)
  const parameters = asRecord(result?.ResultParameters)
  const list = Array.isArray(parameters?.ResultParameter) ? parameters.ResultParameter : []
  return Object.fromEntries(list.flatMap((entry) => {
    const parameter = asRecord(entry)
    return parameter && typeof parameter.Key === 'string' ? [[parameter.Key, parameter.Value]] : []
  }))
}

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options) return options
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, request)
  try {
    if (!booleanEnv('MPESA_B2C_ENABLED') || !booleanEnv('MPESA_B2C_APPROVAL_CONFIRMED')) {
      throw new HttpError('B2C callback processing is disabled.', 503)
    }
    verifyCallbackToken(request, 'MPESA_B2C_RESULT_TOKEN')
    const body = asRecord(await request.json())
    const result = asRecord(body?.Result)
    if (!result) throw new HttpError('Invalid B2C result callback.', 400)
    const originatorId = typeof result.OriginatorConversationID === 'string' ? result.OriginatorConversationID : ''
    const conversationId = typeof result.ConversationID === 'string' ? result.ConversationID : ''
    const resultCode = Number(result.ResultCode)
    if (!originatorId || !conversationId || !Number.isInteger(resultCode)) {
      throw new HttpError('B2C result is missing transaction identifiers.', 400)
    }

    const admin = getAdminClient()
    const { data: transaction, error: lookupError } = await admin
      .from('mpesa_transactions')
      .select('id, amount_kes, originator_conversation_id, conversation_id, status')
      .eq('transaction_type', 'withdrawal')
      .eq('originator_conversation_id', originatorId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!transaction) return jsonResponse({ received: true }, 200, request)
    if (transaction.status === 'succeeded' || transaction.status === 'failed') {
      return jsonResponse({ received: true, status: transaction.status }, 200, request)
    }

    const parameters = resultParameters(result)
    const { error: identifierError } = await admin.rpc('record_mpesa_withdrawal_submission', {
      p_transaction_id: transaction.id,
      p_status: 'submitted',
      p_originator_conversation_id: originatorId,
      p_conversation_id: conversationId,
      p_result_code: String(resultCode),
      p_result_description: typeof result.ResultDesc === 'string' ? result.ResultDesc.slice(0, 240) : '',
    })
    if (identifierError) throw identifierError
    const rawAmount = parameters.TransactionAmount
    const amount = typeof rawAmount === 'number'
      ? rawAmount
      : typeof rawAmount === 'string' && /^\d+$/.test(rawAmount)
        ? Number(rawAmount)
        : null
    const receipt = typeof parameters.TransactionReceipt === 'string' ? parameters.TransactionReceipt : null
    const providerStatus = resultCode === 0
      ? 'succeeded'
      : amount === transaction.amount_kes
        ? 'failed'
        : 'reconciliation'
    const { data, error } = await admin.rpc('finalize_mpesa_withdrawal', {
      p_transaction_id: transaction.id,
      p_status: providerStatus,
      p_originator_conversation_id: originatorId,
      p_conversation_id: conversationId,
      p_amount_kes: amount,
      p_receipt_number: receipt,
      p_provider_result_code: String(resultCode),
      p_provider_result_description: typeof result.ResultDesc === 'string' ? result.ResultDesc.slice(0, 240) : '',
      p_provider_verified: true,
    })
    if (error) throw error
    return jsonResponse({ received: true, status: data?.[0]?.transaction_status ?? 'reconciliation' }, 200, request)
  } catch (error) {
    return safeErrorResponse(error, request)
  }
})
