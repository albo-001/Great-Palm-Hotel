import assert from 'node:assert/strict'
import test from 'node:test'
import { corsHeadersForOrigin, handleOptions, HttpError, jsonResponse, safeErrorResponse } from '../../supabase/functions/_shared/http.ts'

function assertCors(response) {
  assert.equal(response.headers.get('Access-Control-Allow-Methods'), 'POST, OPTIONS')
  const allowedHeaders = response.headers.get('Access-Control-Allow-Headers') ?? ''
  for (const header of ['authorization', 'x-client-info', 'apikey', 'content-type']) {
    assert.match(allowedHeaders, new RegExp(header, 'i'))
  }
}

test('CORS echoes only explicitly allowed origins', () => {
  assert.equal(
    corsHeadersForOrigin('https://app.example', ['https://app.example'])['Access-Control-Allow-Origin'],
    'https://app.example',
  )
  assert.equal(
    corsHeadersForOrigin('https://attacker.example', ['https://app.example'])['Access-Control-Allow-Origin'],
    undefined,
  )
  assert.equal(
    corsHeadersForOrigin('https://app.example', ['https://app.example'])['Access-Control-Allow-Origin'],
    'https://app.example',
  )
})

test('OPTIONS exits with standard browser request headers allowed', () => {
  const response = handleOptions(new Request('https://example.test/functions/v1/mpesa-payments', {
    method: 'OPTIONS',
  }))

  assert.equal(response?.status, 200)
  assertCors(response)
  assert.equal(response?.headers.get('Access-Control-Allow-Origin'), null)
})

test('success and error JSON responses include CORS headers', () => {
  assertCors(jsonResponse({ transaction_id: 'tx', status: 'pending' }, 202))
  assertCors(safeErrorResponse(new HttpError('Invalid request.', 400)))

  const previousError = console.error
  console.error = () => {}
  try {
    assertCors(safeErrorResponse(new Error('Unexpected failure.')))
  } finally {
    console.error = previousError
  }
})
