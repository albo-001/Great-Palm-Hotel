import { HttpError, handleOptions, jsonResponse, readJsonObject, requirePost, safeErrorResponse, requiredEnv } from '../_shared/http.ts'
import { readIntegerKes } from '../_shared/mpesa-validation.js'
import { authenticatedUser, getAdminClient } from '../_shared/supabase.ts'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

Deno.serve(async (request) => {
  const options = handleOptions(request)
  if (options) return options
  const methodError = requirePost(request)
  if (methodError) return methodError

  try {
    const user = await authenticatedUser(request)
    const configuredAdmins = requiredEnv('MPESA_RECONCILIATION_ADMIN_USER_IDS')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
    if (configuredAdmins.some((id) => !uuidPattern.test(id))) {
      throw new HttpError('MPESA_RECONCILIATION_ADMIN_USER_IDS contains an invalid user ID.', 503)
    }
    if (!configuredAdmins.includes(user.id)) throw new HttpError('Administrator authorization is required.', 403)

    const input = await readJsonObject(request)
    const transactionId = typeof input.transaction_id === 'string' ? input.transaction_id : ''
    const status = input.verified_status
    const amount = readIntegerKes(input.amount_kes, 1, 150000)
    const receiptNumber = typeof input.receipt_number === 'string' ? input.receipt_number.trim() : ''
    const evidenceReference = typeof input.evidence_reference === 'string' ? input.evidence_reference.trim() : ''
    const adminNote = typeof input.admin_note === 'string' ? input.admin_note.trim() : ''
    if (!uuidPattern.test(transactionId)) throw new HttpError('Invalid transaction ID.', 400)
    if (status !== 'succeeded' && status !== 'failed') throw new HttpError('Verified status must be succeeded or failed.', 400)
    if (status === 'succeeded' && (receiptNumber.length < 4 || receiptNumber.length > 32)) {
      throw new HttpError('A valid M-Pesa receipt number is required for a successful reconciliation.', 400)
    }
    if (evidenceReference.length < 1 || evidenceReference.length > 160) {
      throw new HttpError('Enter a Safaricom portal reference or support case ID.', 400)
    }
    if (adminNote.length < 10 || adminNote.length > 500) {
      throw new HttpError('Enter a reconciliation note between 10 and 500 characters.', 400)
    }

    const { data, error } = await getAdminClient().rpc('admin_reconcile_mpesa_transaction', {
      p_transaction_id: transactionId,
      p_admin_user_id: user.id,
      p_verified_status: status,
      p_amount_kes: amount,
      p_receipt_number: receiptNumber || null,
      p_evidence_reference: evidenceReference,
      p_admin_note: adminNote,
    })
    if (error) throw new HttpError('The transaction could not be reconciled. Confirm its provider details and current status.', 409)
    const result = data?.[0]
    if (!result || (result.transaction_status !== 'succeeded' && result.transaction_status !== 'failed')) {
      throw new Error('Reconciliation returned no final transaction status.')
    }
    return jsonResponse({
      transaction_id: transactionId,
      status: result.transaction_status,
      balance: result.wallet_balance,
    }, 200, request)
  } catch (error) {
    return safeErrorResponse(error, request)
  }
})
