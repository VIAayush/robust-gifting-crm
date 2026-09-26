import type { SupabaseClient } from '@supabase/supabase-js'
import { getProfile, type ProfileSession } from '@/lib/auth'

/**
 * Granular module.action permission keys, layered on top of the existing
 * profiles.role / app_role system (see supabase/migrations/20260925_supplier_architecture_and_permissions.sql).
 * Backed by role_permissions in the DB - this list exists so callers get
 * autocomplete/typo-safety, the DB row is still the source of truth.
 */
export const PERMISSION_KEYS = [
  'suppliers.view',
  'suppliers.create',
  'suppliers.edit',
  'suppliers.delete',
  'suppliers.cost_view',
  'products.supplier_manage',
  'orders.assign_supplier',
  'orders.procurement',
  'permissions.manage',
  'notifications.view',
  'notifications.manage',
  'pricing.manage',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

/**
 * Checks role_permissions for the given profile's role. Admin always passes -
 * the seed migration grants admin every key, but this also protects against
 * a permission being added later and admin's row not yet being seeded.
 */
export async function hasPermission(
  supabase: SupabaseClient,
  profile: Pick<ProfileSession, 'role'>,
  key: PermissionKey,
): Promise<boolean> {
  if (profile.role === 'admin') return true
  const { data } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .eq('role', profile.role)
    .eq('permission_key', key)
    .maybeSingle()
  return Boolean(data)
}

/** For use inside a Server Action: loads the profile and checks the permission in one call. */
export async function requirePermission(
  supabase: SupabaseClient,
  key: PermissionKey,
): Promise<{ profile: ProfileSession } | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!profile.is_active) return { error: 'Account is not active' }
  const allowed = await hasPermission(supabase, profile, key)
  if (!allowed) return { error: 'You do not have permission to do this' }
  return { profile }
}
