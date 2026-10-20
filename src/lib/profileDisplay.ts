export type AccountDisplayDetails = {
  fullName: string
  phoneNumber: string
}

type ProfileFields = {
  fullName?: unknown
  phoneNumber?: unknown
}

type AuthDisplayFields = ProfileFields & {
  email?: string | null
}

export function resolveAccountDisplayDetails(
  profile: ProfileFields,
  auth: AuthDisplayFields = {},
): AccountDisplayDetails {
  const storedName = typeof profile.fullName === 'string' ? profile.fullName.trim() : ''
  const authName = typeof auth.fullName === 'string' ? auth.fullName.trim() : ''
  const emailName = auth.email?.split('@')[0]?.trim() ?? ''
  const nameIsPlaceholder = !storedName
    || storedName.toLowerCase() === 'account user'
    || (emailName.length > 0 && storedName.toLowerCase() === emailName.toLowerCase())

  const storedPhone = typeof profile.phoneNumber === 'string' ? profile.phoneNumber.trim() : ''
  const authPhone = typeof auth.phoneNumber === 'string' ? auth.phoneNumber.trim() : ''
  const phoneIsPlaceholder = !storedPhone || storedPhone.toLowerCase() === 'not provided'

  return {
    fullName: nameIsPlaceholder ? authName || storedName || 'Account User' : storedName,
    phoneNumber: phoneIsPlaceholder ? authPhone || storedPhone || 'Not provided' : storedPhone,
  }
}
