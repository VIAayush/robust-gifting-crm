# Robust Gifting CRM: pending work and launch checklist

Status written while the Supabase project was unavailable (usage limit). Nothing below marked BLOCKED was run against a database.

## 1. Migrations (apply manually in the Supabase SQL Editor, in this order)

| # | File | Purpose |
|---|------|---------|
| 1 | `supabase/migrations/20261026_module_permissions_and_catalogues.sql` | 36 `module.*` permissions and role grants, multi-company catalogues, client policies |
| 2 | `supabase/migrations/20261027_requirement_workflow.sql` | requirement approval workflow: stages, `requirement_transition()`, `requirement_events`, quotation sync triggers |
| 3 | `supabase/migrations/20261028_company_allowed_email_domains.sql` | `companies.allowed_email_domains` (empty = unrestricted) |

Verification queries are at the bottom of each file. The code tolerates migration 3 being absent (domain check is skipped), but the workflow screens need migration 2.

## 2. Blocked by the database (BLOCKED / NOT VERIFIED)

| Item | Why blocked | Steps when the database returns |
|------|-------------|--------------------------------|
| Requirement workflow end to end (RG-23 to RG-29) | needs migrations 1 and 2 and sign-in | apply 1 and 2; sign in as a client and as admin; run scenarios A to E below |
| Role and RLS tests (admin, sales, management, client_admin, client_user, cross-company) | need live data and logins | for each role confirm the visible/hidden screens; confirm a client never sees internal notes, supplier names, costs |
| Notifications for requirement and quotation events | outbox rows and in-app notifications are written to the database | trigger each event; check `notification_outbox` status (pending/skipped without a WhatsApp token), in-app bell, Resend email |
| Allowed email domains | needs migration 3 | set a domain on a test company, try a login email outside it (must be refused) and inside it |
| Subcategory on product add/edit/CSV | needs live categories/subcategories | add a product with a subcategory; try a mismatched one (must be refused); validate a CSV with a subcategory column |
| Dashboard figures (order value excludes cancelled, collected = paid invoices) | needs data | compare against a manual count |
| Product sales channel (B2B / B2C / both) | schema change plus public catalogue queries; unsafe to ship before the migration, so not built | design an additive `products.sales_channel` migration and filter the public queries with a fallback |
| Festival banners | admin-editable banners need a table | add `site_banners` migration and an admin screen |
| Supplier bulk assignment, vendor cost report, "Subscribe" catalogue importer | operate on live supplier data, and the vendor list and catalogue files have not been supplied | build once the vendor list and sample catalogue file are received |
| MRP test flow | needs test products and a revert, on live data | create two clearly named test products, set MRP, confirm display, revert by exact id |
| PayU live payments | needs PayU credentials from the client | see section 4 |
| WhatsApp live delivery | needs WhatsApp Cloud API access and approved templates, or a WATI decision | see section 5 |

## 3. Required end-to-end scenarios (all BLOCKED until the database returns)

- **A. Success flow**: client creates requirement, admin approves, client confirms, client selects products within budget and submits, admin approves selection, admin creates and sends quotation, client accepts, order creation works as before.
- **B. Rejection and revision**: reject (note required); request changes, client edits and resubmits; selection changes requested and resubmitted.
- **C. Budget and quantity**: over-budget submit needs the acknowledgement box; quantity below MOQ, zero, decimal or huge is refused; totals use selling prices only.
- **D. Security**: client cannot open another company's requirement; client cannot call a staff transition; sales sees only own requirements; internal notes never reach the client; no supplier data in any client page or email.
- **E. Retry and duplicates**: double-click submit creates one requirement (submission key); repeating a decision is a no-op; second draft quotation for one requirement is blocked.

## 4. PayU "Go Live" checklist (demo mode stays on until all are done)

1. Client supplies merchant key and salt for the **test** environment: set `PAYU_KEY`, `PAYU_SALT`, `PAYU_ENVIRONMENT=test`, `PAYMENT_PROVIDER=payu` on Vercel (never in the repo).
2. Run a test payment: success, failure, user-cancel, and a duplicate callback; confirm exactly one order and one paid payment.
3. Confirm the success and failure URLs point at `/api/payments/payu/callback` on the production domain and that the PayU dashboard allows that domain.
4. Confirm the amount-mismatch guard: a success for a different amount is recorded as failed for manual review.
5. Client supplies **production** key and salt; set `PAYU_ENVIRONMENT=production`; run one low-value live payment and refund it.
6. Confirm the refund and settlement process with the client, and the delivery charge and free-delivery threshold (`org_settings.delivery_charge`, `free_delivery_above`) have been set.
7. Only then keep `PAYMENT_PROVIDER=payu`. Removing the variable returns the site to demo mode with no code change.

Code-level checks already automated (no network): `node scripts/test-payu.mts` covers request hash, response hash, tamper rejection and fallback to demo.

## 5. WhatsApp: event coverage and broadcast specification

Existing architecture (kept): events are queued in `notification_outbox` and sent through the WhatsApp Cloud API when `WHATSAPP_*` settings exist; otherwise they are marked `skipped`. No WATI adapter without approval.

| Event | Customer | Staff |
|-------|----------|-------|
| Order created | yes | yes |
| Payment success / failed | yes | no |
| Order status changed | yes | yes |
| Sample requested | yes | yes |
| Requirement submitted / resubmitted | no | yes (new) |
| Requirement approved / changes requested / rejected | yes (new) | no |
| Client confirmed requirement | no | yes (new) |
| Selection submitted | no | yes (new) |
| Selection approved / changes requested | yes (new) | no |
| Quotation sent | yes (new) | no |
| Quotation accepted / declined | no | yes (new) |

New template names to register in WhatsApp Manager, with parameters in this order:
`requirement_update_customer` (customer_name, requirement_name, update) and `requirement_update_staff` (company_name, requirement_name, update).

**Broadcast (new arrivals / festival offers), specification only, not built:** an admin picks a product set or occasion, an audience (all portal companies, or selected companies, only users who have a phone number and have not opted out), and a template; the system writes one outbox row per recipient with a dedupe key `broadcast:{campaign_id}:{profile_id}`, sends in batches within the provider's rate limit, and shows sent/failed/skipped counts. It needs an opt-in/opt-out field, approved marketing templates and the client's decision on WhatsApp versus email, so it is deferred.

## 6. PWA check (code review, no database needed)

Manifest has name, icons (192, 512, maskable), standalone display, scope and start URL. The service worker caches only public pages and icons; `/crm`, `/portal`, `/checkout`, `/cart` and auth pages always go to the network. A native mobile app is out of scope (the MVP document excludes it).

## 7. Launch checklist

- [ ] Migrations 1 to 3 applied in order and their verification queries pass
- [ ] Scenarios A to E pass; role matrix verified
- [ ] 524 products confirmed unchanged (count, SKUs, prices, images, supplier links)
- [ ] Resend domain verified; `RESEND_API_KEY`, `RESEND_FROM_EMAIL` set
- [ ] PayU test then live checklist (section 4) complete, or the site deliberately stays in demo mode
- [ ] WhatsApp credentials and templates approved, or the site deliberately stays queued/skipped
- [ ] Admin account for the client's second admin invited (needs the client's email address)
- [ ] Delivery charge and free-delivery threshold set
- [ ] MRP list received and loaded using the CSV importer (dry-run first)
- [ ] Vendor list and catalogue files received for the supplier import
- [ ] Client reference website received for look-and-feel review
- [ ] `npx tsc --noEmit`, `npm run build`, lint at or below baseline, all `scripts/test-*.mts` pass
- [ ] Mobile pass at 375px on portal, requirement flow and checkout
- [ ] No secrets in the repository; Vercel environment variables reviewed
