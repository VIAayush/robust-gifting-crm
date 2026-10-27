// Stand-ins for Next.js runtime modules and the Supabase client factories, used by isolated action tests only.
// The active fake database is held on globalThis so a test file can swap it between cases.
type Fake = { client: () => unknown }
const g = globalThis as unknown as {
  __rgDb?: Fake
  __rgAdminEnabled?: boolean
  __rgHeaders?: Record<string, string>
  __rgRevalidated?: string[]
}

export class RedirectSignal extends Error {
  destination: string
  constructor(destination: string) {
    super(`NEXT_REDIRECT;${destination}`)
    this.destination = destination
  }
}

export function revalidatePath(path: string) {
  ;(g.__rgRevalidated ||= []).push(path)
}
export function revalidateTag() {}
export function unstable_cache<T extends (...args: never[]) => unknown>(fn: T) {
  return fn
}
export function redirect(destination: string): never {
  throw new RedirectSignal(destination)
}
export function notFound(): never {
  throw new RedirectSignal('/not-found')
}
export async function headers() {
  return new Headers(g.__rgHeaders || { 'x-forwarded-for': '203.0.113.9', host: 'localhost:3000' })
}
export async function cookies() {
  return { getAll: () => [], get: () => undefined, set: () => undefined }
}
export async function createClient() {
  if (!g.__rgDb) throw new Error('test did not install a fake database')
  return g.__rgDb.client()
}
export function createAdminClient() {
  if (!g.__rgDb || !g.__rgAdminEnabled) return null
  return g.__rgDb.client()
}
