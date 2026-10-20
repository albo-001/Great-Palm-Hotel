import { handleOptions, jsonResponse, readJsonObject, requirePost, safeErrorResponse, HttpError } from '../_shared/http.ts'
import { authenticatedUser, getAdminClient } from '../_shared/supabase.ts'

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options) return options
  const methodError = requirePost(request)
  if (methodError) return methodError
  try {
    const user = await authenticatedUser(request)
    const input = await readJsonObject(request)
    const transactionId = typeof input.transaction_id === 'string' ? input.transaction_id : ''
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId)) {
      throw new HttpError('Invalid transaction ID.', 400)
    }
    const admin = getAdminClient()
    const { data, error } = await admin.rpc('get_mpesa_transaction_status', {
      p_user_id: user.id,
      p_transaction_id: transactionId,
    })
    if (error) throw error
    const transaction = data?.[0]
    if (!transaction) throw new HttpError('Transaction was not found.', 404)
    return jsonResponse({
      transaction_id: transaction.transaction_id,
      transaction_type: transaction.transaction_type,
      status: transaction.transaction_status,
      amount_kes: transaction.amount_kes,
      currency: 'KES',
      receipt_number: transaction.mpesa_receipt_number ?? null,
      created_at: transaction.created_at,
      updated_at: transaction.updated_at,
      completed_at: transaction.completed_at,
      balance: transaction.wallet_balance,
    }, 200, request)
  } catch (error) {
    return safeErrorResponse(error, request)
  }
})
