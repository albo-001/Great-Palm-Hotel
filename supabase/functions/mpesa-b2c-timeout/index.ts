import { booleanEnv, handleOptions, HttpError, jsonResponse, safeErrorResponse, verifyCallbackToken } from '../_shared/http.ts'
import { asRecord } from '../_shared/mpesa.js'
import { getAdminClient } from '../_shared/supabase.ts'

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options) return options
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405, request)
  try {
    if (!booleanEnv('MPESA_B2C_ENABLED') || !booleanEnv('MPESA_B2C_APPROVAL_CONFIRMED')) {
      throw new HttpError('B2C timeout processing is disabled.', 503)
    }
    verifyCallbackToken(request, 'MPESA_B2C_TIMEOUT_TOKEN')
    const body = asRecord(await request.json())
    const result = asRecord(body?.Result)
    const originatorId = typeof result?.OriginatorConversationID === 'string' ? result.OriginatorConversationID : ''
    const conversationId = typeof result?.ConversationID === 'string' ? result.ConversationID : ''
    if (!originatorId || !conversationId) throw new HttpError('Invalid B2C timeout callback.', 400)

    const admin = getAdminClient()
    const { data: transaction, error: lookupError } = await admin
      .from('mpesa_transactions')
      .select('id, amount_kes, status')
      .eq('transaction_type', 'withdrawal')
      .eq('originator_conversation_id', originatorId)
      .maybeSingle()
    if (lookupError) throw lookupError
    if (!transaction) return jsonResponse({ received: true }, 200, request)
    const { error: identifierError } = await admin.rpc('record_mpesa_withdrawal_submission', {
      p_transaction_id: transaction.id,
      p_status: 'reconciliation',
      p_originator_conversation_id: originatorId,
      p_conversation_id: conversationId,
      p_result_code: 'TIMEOUT',
      p_result_description: 'B2C timed out. Funds remain reserved until payout status is reconciled.',
    })
    if (identifierError) throw identifierError
    const { data, error } = await admin.rpc('finalize_mpesa_withdrawal', {
      p_transaction_id: transaction.id,
      p_status: 'reconciliation',
      p_originator_conversation_id: originatorId,
      p_conversation_id: conversationId,
      p_amount_kes: transaction.amount_kes,
      p_receipt_number: null,
      p_provider_result_code: 'TIMEOUT',
      p_provider_result_description: 'B2C timed out. Funds remain reserved until payout status is reconciled.',
      p_provider_verified: true,
    })
    if (error) throw error
    return jsonResponse({ received: true, status: data?.[0]?.transaction_status ?? 'reconciliation' }, 202, request)
  } catch (error) {
    return safeErrorResponse(error, request)
  }
})
