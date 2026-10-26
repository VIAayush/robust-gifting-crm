import { requireModule } from '@/lib/module-access'

export default async function ModuleLayout({ children }: { children: React.ReactNode }) {
  await requireModule('my_work')
  return children
}
