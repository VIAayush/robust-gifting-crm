import type { Role } from '@/lib/types'

/**
 * CRM modules for module-level access control (Settings > Role Permissions).
 * Safe for client and server. Stored in role_permissions as `module.<key>`.
 *
 * defaultRoles = who sees the module today (seeded by the migration, and the
 * fallback when the module rows haven't been added yet).
 * eligibleRoles = the most a role can be given: the page guards and RLS
 * underneath are role-based, so module access can narrow but not widen them.
 * Admin always has every module.
 */
export type StaffRole = Extract<Role, 'admin' | 'sales' | 'operations' | 'accounts' | 'management'>

export type CrmModule = {
  key: string
  label: string
  group: string
  prefixes: string[]
  defaultRoles: StaffRole[]
  eligibleRoles: StaffRole[]
}

const ALL: StaffRole[] = ['admin', 'sales', 'operations', 'accounts', 'management']
const SALES: StaffRole[] = ['admin', 'sales', 'management']
const OPS: StaffRole[] = ['admin', 'operations', 'management']
const FINANCE: StaffRole[] = ['admin', 'accounts', 'management']
const MGMT: StaffRole[] = ['admin', 'management']
const ADMIN: StaffRole[] = ['admin']

export const CRM_MODULES: CrmModule[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'Workspace', prefixes: ['/crm/dashboard'], defaultRoles: ALL, eligibleRoles: ALL },
  { key: 'my_work', label: 'My Work', group: 'Workspace', prefixes: ['/crm/my-work'], defaultRoles: ALL, eligibleRoles: ALL },
  { key: 'tasks', label: 'Tasks', group: 'Workspace', prefixes: ['/crm/tasks'], defaultRoles: ALL, eligibleRoles: ALL },
  { key: 'companies', label: 'Companies', group: 'Customers', prefixes: ['/crm/companies'], defaultRoles: SALES, eligibleRoles: SALES },
  { key: 'contacts', label: 'Contacts', group: 'Customers', prefixes: ['/crm/contacts'], defaultRoles: SALES, eligibleRoles: SALES },
  { key: 'leads', label: 'Leads', group: 'Sales', prefixes: ['/crm/leads'], defaultRoles: SALES, eligibleRoles: SALES },
  { key: 'goals', label: 'Goal Tracker', group: 'Sales', prefixes: ['/crm/goals'], defaultRoles: SALES, eligibleRoles: SALES },
  { key: 'requirements', label: 'Requirements', group: 'Sales', prefixes: ['/crm/requirements'], defaultRoles: SALES, eligibleRoles: SALES },
  { key: 'products', label: 'Products', group: 'Sales', prefixes: ['/crm/products'], defaultRoles: [...SALES, 'operations'], eligibleRoles: [...SALES, 'operations'] },
  { key: 'catalogues', label: 'Catalogues', group: 'Sales', prefixes: ['/crm/products/catalogues', '/crm/campaigns'], defaultRoles: SALES, eligibleRoles: SALES },
  { key: 'pricing', label: 'Pricing & MRP', group: 'Sales', prefixes: ['/crm/products/pricing'], defaultRoles: SALES, eligibleRoles: [...SALES, 'operations'] },
  { key: 'mockups', label: 'Mockup Storage', group: 'Sales', prefixes: ['/crm/mockups'], defaultRoles: SALES, eligibleRoles: [...SALES, 'operations'] },
  { key: 'quotations', label: 'Quotations', group: 'Sales', prefixes: ['/crm/quotations'], defaultRoles: SALES, eligibleRoles: SALES },
  { key: 'orders', label: 'Orders', group: 'Sales', prefixes: ['/crm/orders'], defaultRoles: [...SALES, 'operations'], eligibleRoles: ALL },
  { key: 'samples', label: 'Samples', group: 'Sales', prefixes: ['/crm/samples'], defaultRoles: [...SALES, 'operations'], eligibleRoles: [...SALES, 'operations'] },
  { key: 'activities', label: 'Activities', group: 'Sales', prefixes: ['/crm/activities'], defaultRoles: SALES, eligibleRoles: SALES },
  { key: 'order_management', label: 'Order Management', group: 'Operations', prefixes: ['/crm/order-management'], defaultRoles: OPS, eligibleRoles: ALL },
  { key: 'department', label: 'Department', group: 'Operations', prefixes: ['/crm/department'], defaultRoles: OPS, eligibleRoles: ALL },
  { key: 'suppliers', label: 'Suppliers', group: 'Operations', prefixes: ['/crm/suppliers', '/crm/partners'], defaultRoles: OPS, eligibleRoles: ALL },
  { key: 'notifications', label: 'Notifications', group: 'Operations', prefixes: ['/crm/notifications'], defaultRoles: OPS, eligibleRoles: ALL },
  { key: 'printing', label: 'Printing vendors', group: 'Operations', prefixes: ['/crm/printing-vendors'], defaultRoles: OPS, eligibleRoles: OPS },
  { key: 'delivery', label: 'Delivery / dispatch', group: 'Operations', prefixes: ['/crm/courier-partners'], defaultRoles: OPS, eligibleRoles: OPS },
  { key: 'invoices', label: 'Invoices', group: 'Finance', prefixes: ['/crm/invoices'], defaultRoles: FINANCE, eligibleRoles: FINANCE },
  { key: 'payments', label: 'Payments', group: 'Finance', prefixes: ['/crm/payments'], defaultRoles: FINANCE, eligibleRoles: FINANCE },
  { key: 'receivables', label: 'Receivables', group: 'Finance', prefixes: ['/crm/receivables'], defaultRoles: FINANCE, eligibleRoles: FINANCE },
  { key: 'payables', label: 'Payables', group: 'Finance', prefixes: ['/crm/payables'], defaultRoles: FINANCE, eligibleRoles: FINANCE },
  { key: 'gst_reports', label: 'GST Reports', group: 'Finance', prefixes: ['/crm/gst-reports'], defaultRoles: FINANCE, eligibleRoles: FINANCE },
  { key: 'reports', label: 'Reports', group: 'Management', prefixes: ['/crm/reports'], defaultRoles: MGMT, eligibleRoles: [...MGMT, 'accounts'] },
  { key: 'tracking', label: 'Tracking', group: 'Management', prefixes: ['/crm/tracking'], defaultRoles: MGMT, eligibleRoles: MGMT },
  { key: 'reviews', label: 'Reviews', group: 'Management', prefixes: ['/crm/reviews'], defaultRoles: MGMT, eligibleRoles: MGMT },
  { key: 'audit_log', label: 'Audit Log', group: 'Management', prefixes: ['/crm/audit-log'], defaultRoles: MGMT, eligibleRoles: MGMT },
  { key: 'announcements', label: 'Announcements', group: 'System', prefixes: ['/crm/announcements'], defaultRoles: ALL, eligibleRoles: ALL },
  { key: 'knowledge', label: 'Knowledge Center', group: 'System', prefixes: ['/crm/knowledge'], defaultRoles: ALL, eligibleRoles: ALL },
  { key: 'team', label: 'My Team', group: 'Admin', prefixes: ['/crm/team'], defaultRoles: ADMIN, eligibleRoles: ADMIN },
  { key: 'permissions', label: 'Role Permissions', group: 'Admin', prefixes: ['/crm/settings/permissions'], defaultRoles: ADMIN, eligibleRoles: ADMIN },
  { key: 'settings', label: 'Settings', group: 'Admin', prefixes: ['/crm/settings'], defaultRoles: ADMIN, eligibleRoles: ADMIN },
]

export const MODULE_PERMISSION_PREFIX = 'module.'

export function modulePermissionKey(key: string) {
  return `${MODULE_PERMISSION_PREFIX}${key}`
}

export function moduleByKey(key: string) {
  return CRM_MODULES.find((m) => m.key === key) || null
}

/** Most specific module owning a CRM path (e.g. /crm/products/pricing -> pricing, not products). */
export function moduleForPath(pathname: string): CrmModule | null {
  let best: { mod: CrmModule; length: number } | null = null
  for (const mod of CRM_MODULES) {
    for (const prefix of mod.prefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        if (!best || prefix.length > best.length) best = { mod, length: prefix.length }
      }
    }
  }
  return best?.mod ?? null
}

export function defaultModulesForRole(role: string): string[] {
  if (role === 'admin') return CRM_MODULES.map((m) => m.key)
  return CRM_MODULES.filter((m) => (m.defaultRoles as string[]).includes(role)).map((m) => m.key)
}
