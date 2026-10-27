import { createClient } from '@/lib/supabase/server'
import { PRODUCT_COLUMNS, loadProductCosts, loadSupplierMappingCosts } from '@/lib/products/costs'
import { formatCurrency, formatUnits, isUuid } from '@/lib/utils'
import { notFound } from 'next/navigation'
import { sortProductCategories } from '@/lib/products/categories'
import { BackButton } from '@/components/ui/back-button'
import { excludeIndividualCompanies } from '@/lib/companies/individual'
import { updateProduct, removeProduct } from '../actions'
import { ProductFormShell } from '@/components/products/product-form-shell'
import { ConfirmAction } from '@/components/ui/confirm-action'
import { asFormAction } from '@/lib/form-action'
import { Globe, Lock, EyeOff } from 'lucide-react'
import { ProductImageEditor } from '@/components/products/product-image-editor'
import { CatalogueVisibilityEditor } from '@/components/products/catalogue-visibility-editor'
import { ProductCustomizationEditor } from '@/components/products/product-customization-editor'
import { ProductVariantsManager } from '@/components/products/product-variants-manager'
import { ProductGalleryManager } from '@/components/products/product-gallery-manager'
import { requireStaff, canSeeCosts } from '@/lib/auth'
import { MobileSheetSelect } from '@/components/ui/mobile-filter-sheet'
import { hasPermission } from '@/lib/permissions'
import { ProductSuppliersManager } from '@/components/products/product-suppliers-manager'

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ removed?: string; image?: string; error?: string }>
}) {
  const profile = await requireStaff(['admin', 'sales', 'management', 'operations'])
  const showCost = canSeeCosts(profile.role)
  const { id } = await params
  const { removed, image, error } = await searchParams
  if (!isUuid(id)) notFound()
  const supabase = await createClient()

  // sales_channel exists only after its own migration: try with it, fall back without.
  const loadProduct = async () => {
    const relations = 'category:categories(id, name), brand:brands(id, name), supplier:suppliers(id, name)'
    const first = await supabase.from('products').select(`${PRODUCT_COLUMNS}, sales_channel, ${relations}`).eq('id', id).maybeSingle()
    if (first.error && (first.error.code === '42703' || /sales_channel/.test(first.error.message))) {
      return supabase.from('products').select(`${PRODUCT_COLUMNS}, ${relations}`).eq('id', id).maybeSingle()
    }
    return first
  }

  const [
    { data: productBase },
    { data: categories },
    { data: subcategories },
    { data: brands },
    { data: suppliers },
    { data: allCompanies },
    { data: accessRecords },
    { data: variants },
    { data: images },
    { data: productSuppliers },
    canManageSuppliers,
    canSeeSupplierCost,
  ] = await Promise.all([
    loadProduct(),
    supabase.from('categories').select('id, name'),
    supabase.from('subcategories').select('id, name, category_id').order('name'),
    supabase.from('brands').select('id, name').order('name'),
    supabase.from('suppliers').select('id, name').eq('status', 'active').order('name'),
    excludeIndividualCompanies(supabase.from('companies').select('id, name, logo_path').eq('status', 'active')).order('name'),
    supabase.from('company_product_access').select('*, company:companies(id, name, city)').eq('product_id', id),
    supabase.from('product_variants').select('*').eq('product_id', id).eq('status', 'active').order('sort_order'),
    supabase.from('product_images').select('*').eq('product_id', id).order('sort_order'),
    supabase
      .from('product_suppliers')
      .select('id, supplier_id, variant_id, supplier_sku, moq, lead_time_days, is_preferred, status, supplier:suppliers(name)')
      .eq('product_id', id)
      .order('is_preferred', { ascending: false }),
    hasPermission(supabase, profile, 'products.supplier_manage'),
    hasPermission(supabase, profile, 'suppliers.cost_view'),
  ])

  if (!productBase) notFound()

  // Cost, margin and per-supplier cost are not in the ordinary product query (database-level protection): authorised
  // roles fetch them through checked functions, everyone else never receives them. A cost field is only shown as an
  // editable input when it actually loaded, so saving can never overwrite a real cost with a blank.
  const costRow = showCost ? (await loadProductCosts(supabase, [id])).get(id) : undefined
  const costsLoaded = Boolean(costRow)
  const product = {
    ...productBase,
    supplier_cost: costRow?.supplier_cost ?? null,
    internal_margin: costRow?.internal_margin ?? null,
    internal_notes: costRow?.internal_notes ?? null,
  }
  const mappingCosts = canSeeSupplierCost ? await loadSupplierMappingCosts(supabase, (productSuppliers || []).map((m) => m.id as string)) : new Map<string, number | null>()
  const mappingCostsLoaded = canSeeSupplierCost && (mappingCosts.size > 0 || (productSuppliers || []).length === 0)

  const supplierMappings = (productSuppliers || []).map((m) => {
    const s = Array.isArray(m.supplier) ? m.supplier[0] : m.supplier
    return {
      id: m.id,
      supplier_id: m.supplier_id,
      variant_id: m.variant_id,
      supplier_name: s?.name || 'Unknown supplier',
      supplier_sku: m.supplier_sku,
      supplier_cost: mappingCosts.get(m.id as string) ?? null,
      moq: m.moq,
      lead_time_days: m.lead_time_days,
      is_preferred: m.is_preferred,
      status: m.status,
    }
  })

  const productVariants = variants || []
  // Products saved before colour variants/galleries existed have zero
  // product_images rows but still carry their one photo on image_url.
  const productImages =
    images && images.length > 0
      ? images
      : product.image_url
        ? [{ id: 'legacy', variant_id: null, image_url: product.image_url, sort_order: 0, is_primary: true }]
        : []

  const grantedCompanyIds = accessRecords?.map(a => a.company_id) || []

  const saveProduct = updateProduct.bind(null, product.id)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <BackButton href="/crm/products" label="Back to Products" />

      {removed === 'archived' && (
        <div className="p-3 bg-amber-50 text-amber-900 text-xs rounded-xl border border-amber-200">
          This product cannot be permanently deleted because it is used on orders or quotations. It was discontinued instead.
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-50 text-red-800 text-xs rounded-xl border border-red-200">{error}</div>
      )}
      {image === 'needed' && !product.image_url && (
        <div className="p-3 bg-amber-50 text-amber-900 text-xs rounded-xl border border-amber-200">
          This product was saved without a photo. Upload one below so it displays correctly in the catalogue.
        </div>
      )}
      {image === 'upload-failed' && (
        <div className="p-3 bg-amber-50 text-amber-900 text-xs rounded-xl border border-amber-200">
          The product was saved, but the image could not be uploaded. Try again with a JPG, PNG or WebP under 5 MB.
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-6 items-start">
        <ProductImageEditor productId={product.id} imageUrl={product.image_url} name={product.name} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="font-mono text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {product.sku}
            </span>
            {product.catalogue_access === 'all' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-green-100 text-green-800 px-2.5 py-0.5 rounded-full">
                <Globe className="w-3 h-3" /> All companies
              </span>
            )}
            {product.catalogue_access === 'selected' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-purple-100 text-[#9C7A33] px-2.5 py-0.5 rounded-full">
                <Lock className="w-3 h-3" /> {accessRecords?.length || 0} companies
              </span>
            )}
            {product.catalogue_access === 'none' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-gray-100 text-gray-700 px-2.5 py-0.5 rounded-full">
                <EyeOff className="w-3 h-3" /> Not in catalogues
              </span>
            )}
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${
              product.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {product.status}
            </span>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{product.name}</h1>
          <p className="text-xs text-gray-500 mt-1">
            Category: <span className="font-semibold text-gray-700">{(product.category as any)?.name || 'General'}</span>
            {product.brand && <> · Brand: <span className="font-semibold text-gray-700">{(product.brand as any)?.name}</span></>}
            {product.supplier && <> · Supplier: <span className="font-semibold text-gray-700">{(product.supplier as any)?.name}</span></>}
          </p>
          {profile.role === 'admin' && (
            <div className="mt-3">
              <ConfirmAction
                title="Delete product?"
                confirmLabel="Delete"
                action={asFormAction(removeProduct)}
                hiddenFields={{ product_id: product.id }}
                description={
                  <>
                    <p>
                      Product: <span className="font-semibold text-gray-900">{product.name}</span>
                    </p>
                    <p>
                      If this product appears on orders, quotations, or sample history it will be discontinued instead of permanently deleted. Images shared with other products are kept.
                    </p>
                  </>
                }
              >
                Delete Product
              </ConfirmAction>
            </div>
          )}

          <div className="flex items-center gap-6 mt-4 pt-4 border-t border-gray-100">
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-semibold">Selling Price</p>
              <p className="text-xl font-bold text-[#9C7A33]">{formatCurrency(product.price)}</p>
            </div>
            {product.mrp != null && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-semibold">MRP</p>
              <p className="text-lg font-semibold text-gray-700">{formatCurrency(product.mrp)}</p>
            </div>
            )}
            {showCost && costsLoaded && product.supplier_cost != null && (
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-semibold">Supplier Cost</p>
              <p className="text-lg font-semibold text-gray-700">{formatCurrency(product.supplier_cost)}</p>
            </div>
            )}
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-semibold">Min Order Qty</p>
              <p className="text-lg font-semibold text-gray-900">{formatUnits(product.moq ?? 1)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-900 pb-3 border-b border-gray-100">
            Edit Product Information
          </h2>

          <ProductFormShell
            action={saveProduct}
            creating={false}
            existing={{ price: product.price, mrp: product.mrp ?? null, sku: product.sku }}
            successMessage="Product saved."
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Product Name</label>
              <input
                type="text"
                name="name"
                defaultValue={product.name}
                required
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:ring-1 focus:ring-[#9C7A33]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">SKU</label>
                <input
                  type="text"
                  name="sku"
                  defaultValue={product.sku}
                  required
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono uppercase focus:ring-1 focus:ring-[#9C7A33]"
                />
                <p className="text-[10px] text-gray-400 mt-1">Permanent identifier. Admin-only to change; changes are audited.</p>
              </div>

              <MobileSheetSelect
                name="status"
                label="Status"
                showDesktopLabel
                defaultValue={product.status}
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'discontinued', label: 'Discontinued' },
                ]}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="product-price" className="block text-xs font-semibold text-gray-700 mb-1">Selling price (₹)</label>
                <input
                  id="product-price"
                  type="number"
                  step="0.01"
                  min={0}
                  name="price"
                  defaultValue={product.price}
                  required
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="product-mrp" className="block text-xs font-semibold text-gray-700 mb-1">MRP (₹)</label>
                <input
                  id="product-mrp"
                  type="number"
                  step="0.01"
                  min={0}
                  name="mrp"
                  defaultValue={product.mrp ?? ''}
                  placeholder="Optional"
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg"
                />
              </div>
              {showCost && costsLoaded && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Cost (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  name="supplier_cost"
                  defaultValue={product.supplier_cost || ''}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg"
                />
              </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">MOQ</label>
                <input
                  type="number"
                  name="moq"
                  defaultValue={product.moq || 1}
                  required
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MobileSheetSelect
                name="category_id"
                label="Category *"
                required
                showDesktopLabel
                defaultValue={product.category_id || ''}
                emptyLabel="Select Category"
                options={[
                  { value: '', label: 'Select Category' },
                  ...sortProductCategories(categories || []).map((c) => ({ value: c.id, label: c.name })),
                ]}
              />

              {'sales_channel' in product ? (
                <MobileSheetSelect
                  name="sales_channel"
                  label="Sold through"
                  showDesktopLabel
                  defaultValue={(product as { sales_channel?: string }).sales_channel || 'both'}
                  emptyLabel="B2B catalogue and B2C store"
                  options={[
                    { value: 'both', label: 'B2B catalogue and B2C store' },
                    { value: 'b2b', label: 'B2B catalogue only' },
                    { value: 'b2c', label: 'B2C store only' },
                  ]}
                />
              ) : null}

              <MobileSheetSelect
                name="subcategory_id"
                label="Subcategory"
                showDesktopLabel
                defaultValue={product.subcategory_id || ''}
                emptyLabel="Select Subcategory"
                options={[
                  { value: '', label: 'No subcategory' },
                  ...(subcategories || []).map((sub) => ({
                    value: sub.id,
                    label: `${(categories || []).find((c) => c.id === sub.category_id)?.name || ''} › ${sub.name}`,
                  })),
                ]}
              />

              <MobileSheetSelect
                name="brand_id"
                label="Brand"
                showDesktopLabel
                defaultValue={product.brand_id || ''}
                emptyLabel="Select Brand"
                options={[
                  { value: '', label: 'Select Brand' },
                  ...(brands || []).map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>

            <MobileSheetSelect
              name="supplier_id"
              label="Supplier"
              showDesktopLabel
              defaultValue={product.supplier_id || ''}
              emptyLabel="No supplier"
              options={[
                { value: '', label: 'No supplier' },
                ...(suppliers || []).map((s) => ({ value: s.id, label: s.name })),
              ]}
            />

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
              <textarea
                name="description"
                rows={3}
                defaultValue={product.description || ''}
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 text-xs font-semibold text-white bg-[#9C7A33] hover:bg-[#7C6224] hover:text-white rounded-lg shadow-sm transition-colors"
            >
              Save Product Details
            </button>
          </ProductFormShell>
        </div>

        {/* Catalogue visibility is inherently short (a few radio options), so it shares this
            column with Colour variants/Photos rather than sitting alone next to the much
            longer form — otherwise it leaves a large empty gap no matter how it's sized. */}
        <div className="space-y-6">
          {profile.role === 'admin' ? (
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <CatalogueVisibilityEditor
              productId={product.id}
              initialMode={product.catalogue_access || 'all'}
              companies={allCompanies || []}
              grantedIds={grantedCompanyIds}
            />
          </div>
          ) : (
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <h2 className="text-base font-bold text-gray-900 mb-2">Catalogue visibility</h2>
            <p className="text-xs text-gray-500">Only admin can change which companies see this product.</p>
          </div>
          )}

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <ProductCustomizationEditor
              productId={product.id}
              initialEnabled={Boolean(product.customization_enabled)}
              initialFields={product.customization_fields || []}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-900 pb-3 border-b border-gray-100">Colour variants</h2>
              <p className="text-[11px] text-gray-500">
                Add a colour for each way this product comes, then upload that colour&apos;s photos on the right.
                Shoppers will see one product with a colour switcher instead of separate listings.
              </p>
              <ProductVariantsManager
                productId={product.id}
                variants={productVariants.map((v) => ({
                  id: v.id,
                  colour: v.colour,
                  display_name: v.display_name,
                  extra_price: v.extra_price,
                }))}
              />
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm space-y-4">
              <h2 className="text-base font-bold text-gray-900 pb-3 border-b border-gray-100">Photos</h2>
              <ProductGalleryManager
                productId={product.id}
                variants={productVariants.map((v) => ({ id: v.id, label: v.display_name || v.colour || 'Colour' }))}
                images={productImages.map((img) => ({
                  id: img.id,
                  variant_id: img.variant_id,
                  image_url: img.image_url,
                  sort_order: img.sort_order,
                  is_primary: img.is_primary,
                }))}
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
            <ProductSuppliersManager
              productId={product.id}
              mappings={supplierMappings}
              suppliers={suppliers || []}
              variants={productVariants.map((v) => ({ id: v.id, label: v.display_name || v.colour || 'Colour' }))}
              canManage={canManageSuppliers}
              canSeeCost={canSeeSupplierCost && mappingCostsLoaded}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
