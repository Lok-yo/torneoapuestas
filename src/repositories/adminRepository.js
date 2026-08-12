import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { toAppError } from '../lib/errors.js'
import { assertAdapterAvailable } from './adapterAvailability.js'

function assertConfigured() {
  assertAdapterAvailable('admin', 'El servicio de administración no está disponible ahora mismo.')
}

export async function listUserRoles() {
  assertConfigured()
  if (!isSupabaseConfigured) return []

  const { data, error } = await supabase.rpc('list_user_roles')
  if (error) throw toAppError(error)
  return data ?? []
}

export async function grantUserRole(userId, role) {
  assertConfigured()
  if (!isSupabaseConfigured) return { status: 'granted', userId, role }

  const { data, error } = await supabase.rpc('grant_user_role', {
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw toAppError(error)
  return data
}

export async function revokeUserRole(userId, role) {
  assertConfigured()
  if (!isSupabaseConfigured) return { status: 'revoked', userId, role }

  const { data, error } = await supabase.rpc('revoke_user_role', {
    p_user_id: userId,
    p_role: role,
  })
  if (error) throw toAppError(error)
  return data
}
