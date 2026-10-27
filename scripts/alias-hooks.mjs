// Resolve hook for running TypeScript tests directly with node: maps "@/..." to src/ and adds ".ts" when missing.
import { existsSync } from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Isolated action tests run server actions without Next.js or Supabase: these specifiers resolve to in-memory stubs.
const STUBBED = new Set(['next/cache', 'next/headers', 'next/navigation', '@/lib/supabase/server', '@/lib/supabase/admin'])
const stubUrl = pathToFileURL(path.join(root, 'scripts', 'stubs', 'next-stubs.mts')).href

export async function resolve(specifier, context, nextResolve) {
  if (STUBBED.has(specifier)) return nextResolve(stubUrl, context)
  let target = null
  if (specifier.startsWith('@/')) target = path.join(root, 'src', specifier.slice(2))
  else if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier)
  }
  if (target && !path.extname(target)) {
    for (const candidate of [`${target}.ts`, path.join(target, 'index.ts')]) {
      if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context)
    }
  } else if (target && specifier.startsWith('@/') && existsSync(target)) {
    return nextResolve(pathToFileURL(target).href, context)
  }
  return nextResolve(specifier, context)
}
