const paymentStatuses = [
  'initiating',
  'pending',
  'succeeded',
  'cancelled',
  'failed',
  'timed_out',
  'reconciliation',
  'reserved',
  'submitted',
] as const
type PaymentStatus = typeof paymentStatuses[number]
type InvocationResult = Record<string, unknown> & {
  transaction_id: string
  status: PaymentStatus
}

function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === 'string' && paymentStatuses.some((status) => status === value)
}

type PaymentClient = {
  auth: {
    getSession: () => Promise<{
      data: { session: { access_token: string } | null }
      error: { message: string } | null
    }>
  }
  functions: {
    invoke: (
      name: string,
      options: {
        body: Record<string, unknown>
        headers?: Record<string, string>
      },
    ) => Promise<{
      data: unknown
      error: { name?: string; message: string; context?: unknown } | null
    }>
  }
}

export type MpesaDepositRequest = {
  id: string
  status: PaymentStatus
  reused?: boolean
}

export type MpesaTransactionStatus = {
  id: string
  type: 'deposit' | 'withdrawal'
  status: PaymentStatus
  amountKes: number
  currency: 'KES'
  receiptNumber: string | null
  createdAt: string
  completedAt: string | null
  balance: number
}

function redactDiagnosticText(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Z]{2,}\b/gi, '[redacted email]')
    .replace(/\b(?:\+?254|0)?[17]\d{8}\b/g, '[redacted phone]')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, '[redacted id]')
    .replace(/["']?\b(token|secret|password|passkey|api[_-]?key)["']?\s*[:=]\s*["']?[^\s,"'}]+/gi, '$1=[redacted]')
    .slice(0, 500)
}

function safeResponseBody(payload: unknown): unknown {
  if (typeof payload === 'string') return redactDiagnosticText(payload)
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return '[non-object response]'
  const record = payload as Record<string, unknown>
  const safeFields = ['error', 'message', 'code', 'status']
  return Object.fromEntries(safeFields.flatMap((field) => {
    const value = record[field]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return [[field, typeof value === 'string' ? redactDiagnosticText(value) : value]]
    }
    return []
  }))
}

function logInvocationFailure(error: { name?: string; message: string; context?: unknown }, status?: number, body?: unknown): void {
  const errorType = error.name ?? 'UnknownFunctionsError'
  const cause = error.context instanceof Error
    ? {
      name: error.context.name,
      message: redactDiagnosticText(error.context.message),
    }
    : undefined
  console.error('[M-Pesa] Supabase Edge Function invocation failed', {
    type: errorType,
    message: redactDiagnosticText(error.message),
    ...(status === undefined ? {} : { status }),
    ...(body === undefined ? {} : { responseBody: body }),
    ...(cause ? { cause } : {}),
  })
}

function invocationFailure(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    const functionError = error as { name?: string; message: string; context?: unknown }
    logInvocationFailure(functionError)
    return new Error(redactDiagnosticText(functionError.message))
  }
  console.error('[M-Pesa] Supabase Edge Function invocation failed', {
    type: 'UnknownFunctionsError',
    message: 'Invocation rejected without a readable error.',
  })
  return new Error('Could not reach the M-Pesa service. Check your connection and try again.')
}

async function invocationError(error: { name?: string; message: string; context?: unknown }): Promise<Error> {
  if (error.context instanceof Response) {
    try {
      const response = error.context
      const rawBody = await response.clone().text()
      let payload: unknown = rawBody
      try {
        payload = JSON.parse(rawBody) as unknown
      } catch {
        payload = rawBody
      }
      logInvocationFailure(error, response.status, safeResponseBody(payload))
      if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') {
        return new Error(redactDiagnosticText(payload.error))
      }
      if (
        typeof payload === 'object'
        && payload !== null
        && 'status' in payload
        && typeof payload.status === 'string'
      ) {
        return new Error(`M-Pesa request was not accepted (${payload.status}). Your wallet was not credited.`)
      }
    } catch {
      logInvocationFailure(error)
    }
  } else {
    logInvocationFailure(error)
  }
  return new Error(redactDiagnosticText(error.message))
}

export async function requestMpesaDeposit(
  client: PaymentClient,
  amount: number,
  phone: string,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<MpesaDepositRequest> {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Enter a whole KES amount greater than zero.')
  }

  await requirePaymentSession(client)

  let invocation: Awaited<ReturnType<PaymentClient['functions']['invoke']>>
  try {
    invocation = await client.functions.invoke('mpesa-deposit', {
      body: {
        phone_number: phone,
        amount_kes: amount,
        idempotency_key: idempotencyKey,
      },
    })
  } catch (error) {
    throw invocationFailure(error)
  }
  const { data, error } = invocation
  if (error) throw await invocationError(error)
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('M-Pesa returned an invalid response.')
  }

  const result = data as Record<string, unknown>
  if (typeof result.error === 'string') throw new Error(result.error)
  if (typeof result.transaction_id !== 'string' || !isPaymentStatus(result.status)) {
    throw new Error('M-Pesa returned an invalid transaction response.')
  }

  return {
    id: result.transaction_id,
    status: result.status,
    ...(typeof result.reused === 'boolean' ? { reused: result.reused } : {}),
  }
}

export async function requestMpesaWithdrawal(
  client: PaymentClient,
  amount: number,
  phone: string,
  idempotencyKey: string = crypto.randomUUID(),
): Promise<MpesaDepositRequest> {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Enter a whole KES amount greater than zero.')
  }
  await requirePaymentSession(client)

  let invocation: Awaited<ReturnType<PaymentClient['functions']['invoke']>>
  try {
    invocation = await client.functions.invoke('mpesa-withdrawal', {
      body: { amount_kes: amount, phone_number: phone },
      headers: { 'idempotency-key': idempotencyKey },
    })
  } catch (error) {
    throw invocationFailure(error)
  }
  const { data, error } = invocation
  if (error) throw await invocationError(error)
  const result = readInvocationResult(data)
  return {
    id: result.transaction_id,
    status: result.status,
    ...(typeof result.reused === 'boolean' ? { reused: result.reused } : {}),
  }
}

export async function getMpesaTransactionStatus(
  client: PaymentClient,
  transactionId: string,
): Promise<MpesaTransactionStatus> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId)) {
    throw new Error('Invalid M-Pesa transaction reference.')
  }
  await requirePaymentSession(client)

  let invocation: Awaited<ReturnType<PaymentClient['functions']['invoke']>>
  try {
    invocation = await client.functions.invoke('transaction-status', {
      body: { transaction_id: transactionId },
    })
  } catch (error) {
    throw invocationFailure(error)
  }
  const { data, error } = invocation
  if (error) throw await invocationError(error)
  const result = readInvocationResult(data)
  const amountKes = typeof result.amount_kes === 'number' ? result.amount_kes : Number(result.amount_kes)
  const balance = typeof result.balance === 'number' ? result.balance : Number(result.balance)
  if (
    result.transaction_id !== transactionId
    || (result.transaction_type !== 'deposit' && result.transaction_type !== 'withdrawal')
    || !isPaymentStatus(result.status)
    || result.currency !== 'KES'
    || !Number.isSafeInteger(amountKes)
    || amountKes <= 0
    || !Number.isFinite(balance)
    || balance < 0
    || typeof result.created_at !== 'string'
    || !Number.isFinite(Date.parse(result.created_at))
    || !(typeof result.completed_at === 'string' || result.completed_at === null)
    || !(typeof result.receipt_number === 'string' || result.receipt_number === null)
  ) {
    throw new Error('M-Pesa returned an invalid transaction status.')
  }
  return {
    id: result.transaction_id,
    type: result.transaction_type,
    status: result.status,
    amountKes,
    currency: 'KES',
    receiptNumber: result.receipt_number,
    createdAt: result.created_at,
    completedAt: result.completed_at,
    balance,
  }
}

async function requirePaymentSession(client: PaymentClient): Promise<void> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw new Error(`Could not verify your Supabase session: ${sessionError.message}`)
  if (!sessionData.session?.access_token) {
    throw new Error('Sign in to Supabase before requesting an M-Pesa payment.')
  }
}

function readInvocationResult(data: unknown): InvocationResult {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('M-Pesa returned an invalid response.')
  }
  const result = data as Record<string, unknown>
  if (typeof result.error === 'string') throw new Error(result.error)
  if (typeof result.transaction_id !== 'string' || !isPaymentStatus(result.status)) {
    throw new Error('M-Pesa returned an invalid transaction response.')
  }
  return result as InvocationResult
}
