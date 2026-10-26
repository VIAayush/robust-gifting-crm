import { getProfile } from '@/lib/auth'
import { landingPathForRole } from '@/lib/safe-next'
import { SiteHeader } from '@/components/site/site-header'
import { SiteFooter } from '@/components/site/site-footer'
import { CartToast } from '@/components/site/cart-toast'
import { getPublicCatalogueProducts, getPublicCategories } from '@/lib/catalogue/products'
import { homeCategoryTiles, withLiveProducts } from '@/lib/catalogue/curate'
import { slugify } from '@/lib/utils'
import { getGiftMode } from '@/lib/site/gift-mode-server'
import { catalogueHref, productHref, type GiftMode } from '@/lib/site/gift-mode'

export async function SiteShell({
  children,
  mode: forcedMode,
}: {
  children: React.ReactNode
  /** Pages that belong to one mode pass it; shared pages fall back to the remembered cookie. */
  mode?: GiftMode
}) {
  const profile = await getProfile()
  const isClient = profile?.role === 'client_admin' || profile?.role === 'client_user'
  const workspaceHref = profile ? (isClient ? '/portal/catalogue' : landingPathForRole(profile.role)) : null
  const workspaceLabel = profile ? (isClient ? 'Client portal' : 'Workspace') : null
  const [products, categories, cookieMode] = await Promise.all([getPublicCatalogueProducts(), getPublicCategories(), getGiftMode()])
  const mode = forcedMode ?? cookieMode
  const suggestions = products.slice(0, 40).map((product) => ({
    id: product.id,
    name: product.name,
    category_name: product.category_name,
    href: productHref(mode, product.id),
  }))
  const categoryLinks = homeCategoryTiles(withLiveProducts(categories, products), 6).map((category) => ({
    href: `/categories/${slugify(category.name)}`,
    personalizedHref: catalogueHref('personalized', { category: category.id }),
    label: category.name,
  }))

  return (
    <div className="min-h-screen bg-white text-[#1B2430]">
      <SiteHeader
        workspaceHref={workspaceHref}
        workspaceLabel={workspaceLabel}
        suggestions={suggestions}
        categoryLinks={categoryLinks}
        initialMode={mode}
      />
      <main>{children}</main>
      <SiteFooter workspaceHref={workspaceHref} workspaceLabel={workspaceLabel} mode={mode} />
      <CartToast />
    </div>
  )
}
