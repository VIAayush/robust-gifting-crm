'use server'

import { createClient } from '@/lib/supabase/server'
import { getProfile } from '@/lib/auth'
import { parseCsv, splitCompanyNames, splitImageRefs, normalizeImageRef } from '@/lib/csv'
import { revalidatePath } from 'next/cache'
import { PRODUCT_CATEGORY_ALIASES } from '@/lib/products/categories'
import { canonicalColourName, stripColourSuffixFromSku } from '@/lib/products/colours'
import type { SupabaseClient } from '@supabase/supabase-js'

const CATALOGUE_ROLES = ['admin', 'sales'] as const
const IMAGE_BUCKET = 'product-images'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

function publicImageUrl(objectPath: string) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return objectPath
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${IMAGE_BUCKET}/${objectPath.replace(/^\/+/, '')}`
}

export type ImportFailure = { row: number; sku: string; reason: string }
export type ImportWarning = { row?: number; message: string }

export type ImportSummary = {
  total: number
  imported: number
  skipped: number
  failed: number
  failures: ImportFailure[]
  warnings: ImportWarning[]
  committed: boolean
}

function cell(row: Record<string, string>, key: string) {
  return (row[key] || '').trim()
}

function parseAccess(raw: string, companyNames: string[], isAdmin: boolean): 'all' | 'selected' | 'none' {
  if (!isAdmin) return 'all'
  const value = raw.toLowerCase()
  if (value === 'none' || value === 'internal' || value === 'internal_only' || value === 'hidden') return 'none'
  if (value === 'selected' || value === 'specific' || value === 'personalized' || companyNames.length > 0) {
    if (value === 'all' || value === 'global' || value === 'catalogue') return 'all'
    return 'selected'
  }
  if (value === 'all' || value === 'global' || value === 'catalogue' || value === '') return 'all'
  return 'all'
}

type ResolvedImage = { kind: 'url'; url: string } | { kind: 'file'; file: File }

type PreparedRow = {
  rowNumber: number
  name: string
  sku: string
  description: string | null
  category_id: string | null
  supplier_id: string | null
  price: number
  supplier_cost: number | null
  moq: number
  hsn_code: string | null
  images: ResolvedImage[]
  catalogue_access: 'all' | 'selected' | 'none'
  companyIds: string[]
  colour: string | null
  size: string | null
  gender: string | null
  material: string | null
  variant_sku: string | null
  extra_price: number
  status: string
  /** Base SKU this row groups under. Equals `sku` itself for standalone (non-colour) rows. */
  groupSku: string
}

type ProductGroup = {
  groupSku: string
  rows: PreparedRow[]
}

type BuildPlanResult =
  | { error: string }
  | {
      total: number
      skipped: number
      groups: ProductGroup[]
      failures: ImportFailure[]
      warnings: ImportWarning[]
      unusedFiles: string[]
    }

/**
 * Parses and fully validates the CSV + uploaded photos without writing anything.
 * Shared by validateCatalogueCsv (report only) and importCatalogueCsv (report, then
 * commit only if there are zero failures) so the two can never drift apart.
 */
async function buildImportPlan(formData: FormData, supabase: SupabaseClient, profile: { role: string }): Promise<BuildPlanResult> {
  const file = formData.get('csv')
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose a CSV file to import' }
  if (file.size > 2 * 1024 * 1024) return { error: 'CSV must be 2 MB or smaller' }

  let mapping: Record<string, string> = {}
  try {
    mapping = JSON.parse(String(formData.get('mapping') || '{}')) as Record<string, string>
  } catch {
    return { error: 'Column mapping is invalid' }
  }

  const text = await file.text()
  const table = parseCsv(text)
  if (table.headers.length === 0) return { error: 'The CSV file is empty' }

  const headerIndex = new Map(table.headers.map((h, i) => [h, i]))
  const mappedRows = table.rows.map((cells) => {
    const row: Record<string, string> = {}
    for (const [field, header] of Object.entries(mapping)) {
      if (!header) continue
      const idx = headerIndex.get(header)
      row[field] = idx === undefined ? '' : (cells[idx] || '')
    }
    return row
  })

  const [{ data: categories }, { data: suppliers }, { data: companies }, { data: existingProducts }] = await Promise.all([
    supabase.from('categories').select('id, name'),
    supabase.from('suppliers').select('id, name'),
    supabase.from('companies').select('id, name'),
    supabase.from('products').select('sku'),
  ])

  const categoryByName = new Map((categories || []).map((c) => [c.name.trim().toLowerCase(), c.id]))
  for (const [alias, canonical] of Object.entries(PRODUCT_CATEGORY_ALIASES)) {
    const id = categoryByName.get(canonical.toLowerCase())
    if (id && !categoryByName.has(alias)) categoryByName.set(alias, id)
  }
  const supplierByName = new Map((suppliers || []).map((s) => [s.name.trim().toLowerCase(), s.id]))
  const companyByName = new Map((companies || []).map((c) => [c.name.trim().toLowerCase(), c.id]))
  const existingSkus = new Set((existingProducts || []).map((p) => p.sku.trim().toUpperCase()))
  const batchSkus = new Set<string>()

  const imageFiles = formData.getAll('images').filter((item): item is File => item instanceof File && item.size > 0)
  const imageByName = new Map(imageFiles.map((img) => [img.name.trim().toLowerCase(), img]))
  const consumedFiles = new Set<string>()

  const groupsBySku = new Map<string, ProductGroup>()
  const failures: ImportFailure[] = []
  const warnings: ImportWarning[] = []
  let skipped = 0

  mappedRows.forEach((row, index) => {
    const rowNumber = index + 2
    const name = cell(row, 'name')
    const rawSku = cell(row, 'sku').toUpperCase()
    if (!name && !rawSku) {
      skipped += 1
      return
    }
    if (!name || !rawSku) {
      failures.push({ row: rowNumber, sku: rawSku || '—', reason: 'Product name and SKU are required' })
      return
    }

    const explicitColourRaw = cell(row, 'colour')
    const suffixMatch = stripColourSuffixFromSku(rawSku)
    let colour: string | null = null
    let groupSku = rawSku
    if (explicitColourRaw) {
      colour = canonicalColourName(explicitColourRaw)
      groupSku = suffixMatch ? suffixMatch.base : rawSku
    } else if (suffixMatch) {
      colour = suffixMatch.colour
      groupSku = suffixMatch.base
    }

    const existingGroup = groupsBySku.get(groupSku)
    const isJoiningGroup = Boolean(colour) && Boolean(existingGroup)

    // Standalone rows (no colour signal) still need a globally unique SKU, exactly
    // as before. Rows joining an existing colour group reuse that group's product,
    // so they must NOT be checked against the "SKU already exists" rule again.
    if (!isJoiningGroup) {
      if (existingSkus.has(groupSku) || batchSkus.has(groupSku)) {
        failures.push({ row: rowNumber, sku: rawSku, reason: 'SKU already exists' })
        return
      }
    }

    const price = Number(cell(row, 'price'))
    if (!Number.isFinite(price) || price < 0) {
      failures.push({ row: rowNumber, sku: rawSku, reason: 'Price must be a number 0 or greater' })
      return
    }
    const companyNames = splitCompanyNames(cell(row, 'companies'))
    const companyIds: string[] = []
    for (const companyName of companyNames) {
      const id = companyByName.get(companyName.toLowerCase())
      if (!id) {
        failures.push({ row: rowNumber, sku: rawSku, reason: `Company not found: ${companyName}` })
        return
      }
      companyIds.push(id)
    }
    const catalogue_access = parseAccess(cell(row, 'catalogue_access'), companyNames, profile.role === 'admin')
    if (catalogue_access === 'selected' && companyIds.length === 0) {
      failures.push({ row: rowNumber, sku: rawSku, reason: 'Selected visibility requires at least one company' })
      return
    }

    const categoryName = cell(row, 'category')
    const supplierName = cell(row, 'supplier')
    const category_id = categoryName ? categoryByName.get(categoryName.toLowerCase()) || null : null
    if (categoryName && !category_id) {
      failures.push({ row: rowNumber, sku: rawSku, reason: `Category not found: ${categoryName}` })
      return
    }
    const supplier_id = supplierName ? supplierByName.get(supplierName.toLowerCase()) || null : null
    if (supplierName && !supplier_id) {
      failures.push({ row: rowNumber, sku: rawSku, reason: `Supplier not found: ${supplierName}` })
      return
    }

    // Image references: both image_url and image_filename may hold one or more
    // comma/semicolon/pipe-delimited entries. image_filename entries are matched
    // against the uploaded Product Photos by basename (case/path/whitespace-
    // insensitive) unless they're themselves an http(s) URL.
    const images: ResolvedImage[] = []
    const urlRefs = splitImageRefs(cell(row, 'image_url'))
    let badUrlRef: string | null = null
    for (const ref of urlRefs) {
      if (!/^https?:\/\//i.test(ref)) {
        badUrlRef = ref
        break
      }
      images.push({ kind: 'url', url: ref })
    }
    if (badUrlRef) {
      failures.push({ row: rowNumber, sku: rawSku, reason: `image_url entry "${badUrlRef}" must be an http(s) URL` })
      return
    }
    const filenameRefs = splitImageRefs(cell(row, 'image_filename'))
    let unresolvedRef: string | null = null
    for (const ref of filenameRefs) {
      const normalized = normalizeImageRef(ref)
      if (!normalized) continue
      if (normalized.kind === 'url') {
        images.push({ kind: 'url', url: normalized.value })
        continue
      }
      const matched = imageByName.get(normalized.basename)
      if (!matched) {
        unresolvedRef = ref
        break
      }
      if (matched.size > MAX_IMAGE_BYTES || !ALLOWED_IMAGE_TYPES[matched.type]) {
        failures.push({ row: rowNumber, sku: rawSku, reason: `Image "${ref}" must be PNG, JPG or WebP under 5 MB` })
        return
      }
      images.push({ kind: 'file', file: matched })
      consumedFiles.add(matched.name.trim().toLowerCase())
    }
    if (unresolvedRef) {
      failures.push({
        row: rowNumber,
        sku: rawSku,
        reason: `Image "${unresolvedRef}" could not be matched to any uploaded photo. Check the filename (or its Product Photos upload) and try again.`,
      })
      return
    }

    const statusRaw = cell(row, 'status').toLowerCase() || 'active'
    const status = ['active', 'inactive', 'discontinued'].includes(statusRaw) ? statusRaw : 'active'
    const supplierCostRaw = cell(row, 'supplier_cost')
    const supplier_cost = supplierCostRaw ? Number(supplierCostRaw) : null
    if (supplierCostRaw && !Number.isFinite(supplier_cost as number)) {
      failures.push({ row: rowNumber, sku: rawSku, reason: 'Supplier cost must be a number' })
      return
    }

    if (!isJoiningGroup) batchSkus.add(groupSku)

    const prepared: PreparedRow = {
      rowNumber,
      name,
      sku: rawSku,
      description: cell(row, 'description') || null,
      category_id,
      supplier_id,
      price,
      supplier_cost,
      moq: Math.max(1, parseInt(cell(row, 'moq') || '1', 10) || 1),
      hsn_code: cell(row, 'hsn_code') || null,
      images,
      catalogue_access,
      companyIds: profile.role === 'admin' ? [...new Set(companyIds)] : [],
      colour,
      size: cell(row, 'size') || null,
      gender: cell(row, 'gender') || null,
      material: cell(row, 'material') || null,
      variant_sku: cell(row, 'variant_sku').toUpperCase() || null,
      extra_price: Number(cell(row, 'extra_price') || '0') || 0,
      status,
      groupSku,
    }

    let group = groupsBySku.get(groupSku)
    if (!group) {
      group = { groupSku, rows: [] }
      groupsBySku.set(groupSku, group)
    } else if (colour) {
      const baseName = group.rows[0].name.trim().toLowerCase()
      if (prepared.name.trim().toLowerCase() !== baseName) {
        warnings.push({
          row: rowNumber,
          message: `Row ${rowNumber}: name "${prepared.name}" differs from "${group.rows[0].name}" already used for SKU ${groupSku}. Double-check this is really the same product before importing.`,
        })
      }
    }
    group.rows.push(prepared)
  })

  const unusedFiles = imageFiles
    .map((f) => f.name)
    .filter((name) => !consumedFiles.has(name.trim().toLowerCase()))
  if (unusedFiles.length > 0) {
    warnings.push({
      message: `${unusedFiles.length} uploaded photo${unusedFiles.length === 1 ? '' : 's'} ${unusedFiles.length === 1 ? 'was' : 'were'} not referenced by the CSV: ${unusedFiles.join(', ')}`,
    })
  }

  const groups = Array.from(groupsBySku.values())
  if (groups.length === 0 && failures.length === 0) {
    return { error: 'No product rows found in the CSV' }
  }

  return { total: table.rows.length, skipped, groups, failures, warnings, unusedFiles }
}

function planToSummary(plan: Exclude<BuildPlanResult, { error: string }>, imported: number, committed: boolean): ImportSummary {
  return {
    total: plan.total,
    imported,
    skipped: plan.skipped,
    failed: plan.failures.length,
    failures: plan.failures,
    warnings: plan.warnings,
    committed,
  }
}

/** Validates the CSV + photos and reports every issue, without writing anything to the database or storage. */
export async function validateCatalogueCsv(formData: FormData): Promise<ImportSummary | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!CATALOGUE_ROLES.includes(profile.role as (typeof CATALOGUE_ROLES)[number])) {
    return { error: 'Not permitted to import products' }
  }
  const supabase = await createClient()
  const plan = await buildImportPlan(formData, supabase, profile)
  if ('error' in plan) return plan
  const rowCount = plan.groups.reduce((sum, g) => sum + g.rows.length, 0)
  return planToSummary(plan, rowCount, false)
}

export async function importCatalogueCsv(formData: FormData): Promise<ImportSummary | { error: string }> {
  const profile = await getProfile()
  if (!profile) return { error: 'Not authenticated' }
  if (!CATALOGUE_ROLES.includes(profile.role as (typeof CATALOGUE_ROLES)[number])) {
    return { error: 'Not permitted to import products' }
  }

  const supabase = await createClient()
  const plan = await buildImportPlan(formData, supabase, profile)
  if ('error' in plan) return plan

  // Pre-import validation gate: the whole file must be clean before anything is
  // written, so a bad row can never leave behind a broken/partial product.
  if (plan.failures.length > 0) {
    return planToSummary(plan, 0, false)
  }

  let imported = 0
  for (const group of plan.groups) {
    const first = group.rows[0]
    const visibility =
      first.catalogue_access === 'all'
        ? 'catalogue'
        : first.catalogue_access === 'selected'
          ? 'selected_companies'
          : 'internal_only'

    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name: first.name,
        sku: group.groupSku,
        description: first.description,
        category_id: first.category_id,
        supplier_id: first.supplier_id,
        price: first.price,
        supplier_cost: Number.isFinite(first.supplier_cost as number) ? first.supplier_cost : null,
        moq: first.moq,
        hsn_code: first.hsn_code,
        image_url: null,
        status: first.status,
        catalogue_access: first.catalogue_access,
        visibility,
      })
      .select('id')
      .single()

    if (error || !product) {
      for (const row of group.rows) {
        plan.failures.push({
          row: row.rowNumber,
          sku: row.sku,
          reason: error?.code === '23505' ? 'SKU already exists' : error?.message || 'Could not save product',
        })
      }
      continue
    }

    if (first.catalogue_access === 'selected') {
      const { error: accessError } = await supabase.from('company_product_access').insert(
        first.companyIds.map((company_id) => ({ product_id: product.id, company_id })),
      )
      if (accessError) {
        await supabase.from('products').delete().eq('id', product.id)
        plan.failures.push({
          row: first.rowNumber,
          sku: first.sku,
          reason: `Company visibility could not be stored: ${accessError.message}`,
        })
        continue
      }
    }

    let primaryImageUrl: string | null = null
    for (const row of group.rows) {
      let variantId: string | null = null
      if (row.colour || row.size || row.gender || row.material) {
        const { data: variant, error: variantError } = await supabase
          .from('product_variants')
          .insert({
            product_id: product.id,
            colour: row.colour,
            display_name: row.colour,
            size: row.size,
            gender: row.gender,
            material: row.material,
            sku: row.variant_sku,
            extra_price: row === first ? 0 : row.price !== first.price ? Math.round((row.price - first.price) * 100) / 100 : row.extra_price,
            sort_order: group.rows.indexOf(row),
          })
          .select('id')
          .single()
        if (variantError) {
          plan.failures.push({ row: row.rowNumber, sku: row.sku, reason: `Colour variant could not be saved: ${variantError.message}` })
          continue
        }
        variantId = variant.id
      }

      for (let i = 0; i < row.images.length; i++) {
        const image = row.images[i]
        let imageUrl: string
        let storagePath: string | null = null
        if (image.kind === 'url') {
          imageUrl = image.url
        } else {
          const extension = ALLOWED_IMAGE_TYPES[image.file.type]
          const objectPath = `${product.id}/${variantId || 'shared'}/${Date.now()}-${i}.${extension}`
          const { error: uploadError } = await supabase.storage
            .from(IMAGE_BUCKET)
            .upload(objectPath, image.file, { contentType: image.file.type, upsert: false })
          if (uploadError) {
            plan.failures.push({ row: row.rowNumber, sku: row.sku, reason: `Image upload failed: ${uploadError.message}` })
            continue
          }
          storagePath = objectPath
          imageUrl = publicImageUrl(objectPath)
        }
        const isPrimary = !primaryImageUrl
        await supabase.from('product_images').insert({
          product_id: product.id,
          variant_id: variantId,
          image_url: imageUrl,
          storage_path: storagePath,
          sort_order: i,
          is_primary: isPrimary,
        })
        if (isPrimary) primaryImageUrl = imageUrl
      }
    }

    if (primaryImageUrl) {
      await supabase.from('products').update({ image_url: primaryImageUrl }).eq('id', product.id)
    }

    imported += 1
  }

  revalidatePath('/crm/products')
  revalidatePath('/portal/catalogue')

  return planToSummary(plan, imported, true)
}
