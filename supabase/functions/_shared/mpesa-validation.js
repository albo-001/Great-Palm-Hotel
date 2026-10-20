import { HttpError } from './http.ts'

export function normalizeKenyanPhone(input) {
  if (typeof input !== 'string') throw new HttpError('Enter a valid Kenyan M-Pesa phone number.', 400)
  const compact = input.trim().replace(/[\s()-]/g, '')
  if (/^0[17]\d{8}$/.test(compact)) return `254${compact.slice(1)}`
  if (/^\+254[17]\d{8}$/.test(compact)) return compact.slice(1)
  if (/^254[17]\d{8}$/.test(compact)) return compact
  throw new HttpError('Use a Kenyan mobile number such as 07XXXXXXXX or 2547XXXXXXXX.', 400)
}

export function readIntegerKes(input, min, max) {
  const amount = typeof input === 'number'
    ? input
    : typeof input === 'string' && /^\d+$/.test(input)
      ? Number(input)
      : Number.NaN
  if (!Number.isSafeInteger(amount) || amount < min || amount > max) {
    throw new HttpError(`Amount must be a whole KES value between ${min} and ${max}.`, 400)
  }
  return amount
}

export function configuredInteger(name, fallback, minimum, maximum) {
  const rawValue = Deno.env.get(name)?.trim()
  const value = rawValue ? Number(rawValue) : fallback
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new HttpError(`${name} must be an integer between ${minimum} and ${maximum}.`, 503)
  }
  return value
}

export function safeProviderDescription(value) {
  return typeof value === 'string' ? value.slice(0, 240) : ''
}

export function asRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : null
}

export function timingSafeEquals(left, right) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)
  let difference = leftBytes.length ^ rightBytes.length
  const size = Math.max(leftBytes.length, rightBytes.length)
  for (let index = 0; index < size; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0)
  }
  return difference === 0
}

export function stkPassword(shortcode, passkey, timestamp) {
  return btoa(`${shortcode}${passkey}${timestamp}`)
}

export function darajaTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}${values.month}${values.day}${values.hour}${values.minute}${values.second}`
}
