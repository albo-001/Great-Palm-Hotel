const baseCorsHeaders = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  Vary: 'Origin',
}

export function corsHeadersForOrigin(origin: string | null, allowedOrigins: string[]): Record<string, string> {
  const normalizedAllowedOrigins = allowedOrigins.map((value) => value.trim()).filter(Boolean)
  const allowedOrigin = origin && normalizedAllowedOrigins.includes(origin) ? origin : null
  return {
    ...baseCorsHeaders,
    ...(allowedOrigin ? { 'Access-Control-Allow-Origin': allowedOrigin } : {}),
  }
}

function configuredCorsHeaders(request?: Request): Record<string, string> {
  const configuredOrigins = typeof Deno === 'undefined' ? undefined : Deno.env.get('MPESA_ALLOWED_ORIGINS')
  const allowedOrigins = configuredOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) ?? []
  return corsHeadersForOrigin(request?.headers.get('origin') ?? null, allowedOrigins)
}

export function jsonResponse(body: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...configuredCorsHeaders(request),
      'Content-Type': 'application/json',
    },
  })
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null
  const origin = request.headers.get('origin')
  const headers = configuredCorsHeaders(request)
  if (origin && !headers['Access-Control-Allow-Origin']) {
    return new Response('origin not allowed', { status: 403, headers })
  }
  return new Response('ok', { headers })
}

export function requirePost(request: Request): Response | null {
  return request.method === 'POST'
    ? null
    : jsonResponse({ error: 'Method not allowed.' }, 405, request)
}

export function safeErrorResponse(error: unknown, request?: Request): Response {
  if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status, request)
  console.error('[M-Pesa]', {
    event: 'payment_request_failed',
    error_type: error instanceof Error ? error.name : 'unknown',
  })
  return jsonResponse({ error: 'Payment service is temporarily unavailable. Check transaction status before retrying.' }, 500, request)
}

export class HttpError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new HttpError('Content-Type must be application/json.', 415)
  }
  let value: unknown
  try {
    value = await request.json()
  } catch {
    throw new HttpError('Request body must be valid JSON.', 400)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError('Request body must be a JSON object.', 400)
  }
  return value as Record<string, unknown>
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new HttpError(`Server configuration is missing ${name}.`, 503)
  return value
}

export function requiredEnvFrom(primaryName: string, legacyName?: string): string {
  const primaryValue = Deno.env.get(primaryName)?.trim()
  const legacyValue = legacyName ? Deno.env.get(legacyName)?.trim() : undefined
  const value = primaryValue || legacyValue
  if (!value) throw new HttpError(`Server configuration is missing ${primaryName}.`, 503)
  return value
}

export function booleanEnv(name: string): boolean {
  return Deno.env.get(name)?.trim().toLowerCase() === 'true'
}
