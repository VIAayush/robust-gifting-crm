import { CRM_MODULES, modulePermissionKey, type StaffRole } from '@/lib/modules'
import { PERMISSION_KEYS } from '@/lib/permission-keys'

/**
 * One-click role templates for Settings > Role Permissions. Each template targets one staff role and
 * lists exactly the module and action permissions that role should end up with. Applying a template
 * makes the role match it (extra grants are removed). Admin is not a template target: it always
 * has everything and cannot be changed.
 *
 * Mapping to the existing roles: Manager -> management, Order processing -> operations,
 * Sales -> sales, Accounts -> accounts. No template grants a module the role is not eligible for.
 */
export type RoleTemplateKey = 'manager' | 'order_processing' | 'sales' | 'accounts'

export type RoleTemplate = {
  key: RoleTemplateKey
  label: string
  role: StaffRole
  summary: string
  modules: string[]
  actions: string[]
}

const WORKSPACE = ['dashboard', 'my_work', 'tasks', 'announcements', 'knowledge']

function eligible(role: StaffRole, keys: string[]) {
  return keys.filter((key) => {
    const mod = CRM_MODULES.find((m) => m.key === key)
    return mod ? (mod.eligibleRoles as string[]).includes(role) : false
  })
}

const MANAGER_EXCLUDED_MODULES = ['permissions', 'settings', 'team']
const MANAGER_EXCLUDED_ACTIONS = ['permissions.manage']

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'manager',
    label: 'Manager',
    role: 'management',
    summary: 'Broad access to every module the role can open, except Role Permissions, Settings and My Team. Cannot manage permissions.',
    modules: eligible(
      'management',
      CRM_MODULES.map((m) => m.key).filter((key) => !MANAGER_EXCLUDED_MODULES.includes(key)),
    ),
    actions: PERMISSION_KEYS.filter((key) => !MANAGER_EXCLUDED_ACTIONS.includes(key)),
  },
  {
    key: 'order_processing',
    label: 'Order processing',
    role: 'operations',
    summary: 'Orders, order management, department queue and dispatch only. No suppliers, vendor cost, procurement or pricing.',
    modules: eligible('operations', [...WORKSPACE, 'orders', 'order_management', 'department', 'delivery']),
    actions: ['notifications.view'],
  },
  {
    key: 'sales',
    label: 'Sales',
    role: 'sales',
    summary: 'Companies, contacts, leads, requirements, products, catalogues, quotations, orders and samples. No supplier cost or price changes.',
    modules: eligible('sales', [
      ...WORKSPACE,
      'companies',
      'contacts',
      'leads',
      'goals',
      'requirements',
      'products',
      'catalogues',
      'quotations',
      'orders',
      'samples',
      'activities',
    ]),
    actions: ['notifications.view'],
  },
  {
    key: 'accounts',
    label: 'Accounts',
    role: 'accounts',
    summary: 'Invoices, payments, receivables, payables and GST reports. No supplier, procurement or pricing changes.',
    modules: eligible('accounts', [...WORKSPACE, 'invoices', 'payments', 'receivables', 'payables', 'gst_reports']),
    actions: ['notifications.view'],
  },
]

export function roleTemplateByKey(key: string) {
  return ROLE_TEMPLATES.find((t) => t.key === key) || null
}

/** The full set of permission keys (module.* and action keys) a template stands for. */
export function templatePermissionKeys(template: RoleTemplate) {
  return [...template.modules.map(modulePermissionKey), ...template.actions]
}

/** Which keys to add and remove so a role's current grants become exactly the template. */
export function diffTemplate(template: RoleTemplate, currentKeys: string[]) {
  const wanted = new Set(templatePermissionKeys(template))
  const current = new Set(currentKeys)
  return {
    add: [...wanted].filter((key) => !current.has(key)),
    remove: [...current].filter((key) => !wanted.has(key)),
  }
}
