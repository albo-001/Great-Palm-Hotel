import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2'
import { HttpError, requiredEnv } from './http.ts'

let adminClient: SupabaseClient | undefined

export function getAdminClient(): SupabaseClient {
  adminClient ??= createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  return adminClient
}

export async function authenticatedUser(request: Request): Promise<User> {
  const authorization = request.headers.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) throw new HttpError('Sign in to continue.', 401)
  const client = createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await client.auth.getUser(token)
  if (error || !data.user) throw new HttpError('Your session is invalid or expired.', 401)
  return data.user
}
