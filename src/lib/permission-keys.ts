/** Permission keys without any server imports, so client components and tests can use them. */
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
