import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeKenyanPhone, readIntegerKes } from '../../supabase/functions/_shared/mpesa-validation.js'

test('normalizes supported Kenyan M-Pesa mobile number formats', () => {
  assert.equal(normalizeKenyanPhone('0712 345 678'), '254712345678')
  assert.equal(normalizeKenyanPhone('+254 (712) 345-678'), '254712345678')
  assert.equal(normalizeKenyanPhone('254112345678'), '254112345678')
})

test('rejects non-Kenyan and malformed mobile numbers', () => {
  for (const phone of ['', '071234567', '254212345678', '+2547123456789', 254712345678]) {
    assert.throws(() => normalizeKenyanPhone(phone), /valid Kenyan M-Pesa phone|Kenyan mobile number/)
  }
})

test('accepts only whole KES amounts within the configured bounds', () => {
  assert.equal(readIntegerKes(1, 1, 150000), 1)
  assert.equal(readIntegerKes('150000', 1, 150000), 150000)
  for (const amount of [0, -1, 150001, 1.5, '1.5', '1e3', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => readIntegerKes(amount, 1, 150000), /whole KES value/)
  }
})
