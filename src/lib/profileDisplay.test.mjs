import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveAccountDisplayDetails } from './profileDisplay.ts'

test('uses the registration Auth metadata when the database contains trigger placeholders', () => {
  assert.deepEqual(
    resolveAccountDisplayDetails(
      { fullName: 'Account User', phoneNumber: 'Not provided' },
      { fullName: 'Taylor Morgan', phoneNumber: '+254 712 345 678' },
    ),
    { fullName: 'Taylor Morgan', phoneNumber: '+254 712 345 678' },
  )
})

test('replaces a profile name that was defaulted to the email local part', () => {
  assert.deepEqual(
    resolveAccountDisplayDetails(
      { fullName: 'taylor.m', phoneNumber: 'Not provided' },
      { email: 'taylor.m@example.test', fullName: 'Taylor Morgan', phoneNumber: '0712345678' },
    ),
    { fullName: 'Taylor Morgan', phoneNumber: '0712345678' },
  )
})

test('preserves non-placeholder database profile values', () => {
  assert.deepEqual(
    resolveAccountDisplayDetails(
      { fullName: 'Taylor Morgan', phoneNumber: '0712345678' },
      { email: 'taylor.m@example.test', fullName: 'Different Name', phoneNumber: '0799999999' },
    ),
    { fullName: 'Taylor Morgan', phoneNumber: '0712345678' },
  )
})
