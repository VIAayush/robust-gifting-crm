// Helpers for isolated server-action tests. Nothing here reaches a database, the network or a provider.
// @ts-expect-error -- run directly by node (type stripping), which needs the .ts extension
import { FakeDb } from './fake-supabase.mts'

export { FakeDb }
export type Role = 'admin' | 'sales' | 'operations' | 'accounts' | 'management' | 'client_admin' | 'client_user'

const g = globalThis as unknown as { __rgDb?: unknown; __rgAdminEnabled?: boolean; __rgHeaders?: Record<string, string>; __rgRevalidated?: string[] }

/** Makes `db` the database every action sees, and optionally enables the service-role client. */
export function install(db: InstanceType<typeof FakeDb>, options: { admin?: boolean; headers?: Record<string, string> } = {}) {
  g.__rgDb = db
  g.__rgAdminEnabled = options.admin ?? true
  g.__rgHeaders = options.headers
  g.__rgRevalidated = []
  return db
}

let n = 0
/** Adds a profile (and signs the test in as them). company is a client user's company id. */
export function profile(db: InstanceType<typeof FakeDb>, role: Role, extra: Record<string, unknown> = {}) {
  const id = `10000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  db.seed('profiles', [{ id, role, full_name: `${role} ${n}`, email: `${role}${n}@example.test`, is_active: true, department_id: null, company_id: null, ...extra }])
  return id
}
export function signIn(db: InstanceType<typeof FakeDb>, id: string | null) {
  db.signedInAs(id)
}

/** Runs an action and returns its result, turning a Next redirect() into { redirected: '/path' }. */
export async function call<T>(fn: () => Promise<T>): Promise<T | { redirected: string }> {
  try {
    return await fn()
  } catch (error) {
    const message = (error as Error).message || ''
    if (message.startsWith('NEXT_REDIRECT;')) return { redirected: message.slice('NEXT_REDIRECT;'.length) }
    throw error
  }
}

export function isError(result: unknown): result is { error: string } {
  return typeof result === 'object' && result !== null && 'error' in result && typeof (result as { error: unknown }).error === 'string'
}
export function isSuccess(result: unknown): boolean {
  return typeof result === 'object' && result !== null && 'success' in result && (result as { success: unknown }).success === true
}

export function form(values: Record<string, string>) {
  const f = new FormData()
  for (const [k, v] of Object.entries(values)) f.set(k, v)
  return f
}
