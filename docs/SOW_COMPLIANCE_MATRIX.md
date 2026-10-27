# Scope of Work compliance matrix

Reference: `Robust Gifting CRM - Scope of Work-final.pdf` (7 pages, 26 October 2026). Section and page numbers below refer to that PDF.

**How to read this.** The audit was a code review of the repository plus local checks: `npx tsc --noEmit`, 21 unit test files (`scripts/test-*.mts`), `npm run build`, and browser/HTTP checks of public routes at 375px. No database was available, so nothing that reads or writes Supabase, depends on RLS, sends a real email/WhatsApp message or takes a real payment has been exercised.

Statuses: **PASS** (implemented and verified in this environment), **PARTIAL**, **MISSING**, **BLOCKED** (needs Supabase, credentials or client data), **NOT VERIFIED** (code exists, behaviour not exercised). A feature is never PASS only because a file or test exists: most rows are therefore NOT VERIFIED or BLOCKED for the database-backed part, with the pure logic covered by unit tests where noted.

"Fix w/o DB" says whether a gap could be closed locally. Items fixed in this audit are marked **FIXED (local)** and still need the listed integration test later.

## Migrations needed by the current code, in application order

| # | File | Needed for |
|---|------|-----------|
| 1 | `20261026_module_permissions_and_catalogues.sql` | role-wise module access, role templates, new Catalogues screen, multi-company catalogues |
| 2 | `20261027_requirement_workflow.sql` | RG-23 to RG-29 requirement approval flow (client requirement list and creation depend on it) |
| 3 | `20261028_company_allowed_email_domains.sql` | allowed email domains (admin form, enforced on admin-created logins and on client-admin invitations) |
| 4 | `20261029_pricing_batches.sql` | price batches and rollback |
| 5 | `20261030_staff_notification_email.sql` | configurable staff alert address |
| 6 | `20261031_product_sales_channel.sql` | B2B / B2C / both per product and the portal view filter |
| 7 | `20261032_site_banners.sql` | CRM-managed festival/occasion banners |
| 8 | `20261033_quotation_item_decisions.sql` | item-by-item quotation acceptance; order built from accepted items only |
| 9 | `20261034_order_history_handoff_and_sample_team.sql` | assignee/department/due date kept per stage change, no duplicate history rows, sample moves to/from the team location, atomic `move_sample` / `receive_sample` |
| 10 | `20261035_order_cost_protection.sql` | order cost columns and supplier cost per order line no longer readable through the data API (permission-checked functions instead) |
| 11 | `20261036_rate_limits.sql` | shared rate limiting for the enquiry form, personalisation uploads and order lookup |
| 12 | `20261037_product_cost_protection.sql` | product cost, margin, internal notes and per-supplier cost no longer readable through the data API (including with the public anon key) |

All are additive and idempotent, enable RLS where they add a table, and have verification queries at the bottom. The application tolerates 3 to 12 being absent (feature simply inactive or, for quotations, whole-quotation response only); 2 is required for the client requirement screens. **None has been applied.** Migrations 10 and 12 change API privileges: apply them together with this version of the code (the code already lists columns explicitly), then run their verification queries with the anon key and as a client, sales and operations user.

---

## Section 3.1 Public website (pp. 1-2)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Home page: featured gifts, categories, collections, occasions, gift finder, shop-by-price | `components/site/public-home.tsx`, `gift-finder.tsx` | NOT VERIFIED | Sections present in code; data comes from the catalogue (DB). Home renders at 375px without overflow (checked); catalogue sections need data | n/a | Load home with the 524 products; each section populated |
| New arrivals, trending, banners, recently viewed | `public-home.tsx`, `lib/catalogue/trending*.ts`, `lib/site/banners.ts`, `recently-viewed*` | PARTIAL (built) | Rules unit-tested (trending, banners, recently viewed). Trending ranks real order and shortlist activity and the heading says "Featured picks" when there is none | done | Place orders, confirm trending order; create a banner |
| Corporate / Personalized switch, remembered, links stay in mode | `lib/site/gift-mode*.ts`, `gift-mode-toggle.tsx` | PASS (browser, partial) | Cookie set; switch present at 375px; mode persisted from `/personalized` to `/about`. Link containment across all pages not exhaustively clicked | n/a | Click every nav path in both modes |
| Corporate catalogue: search, category, price filters, sort, grid and list views | `catalogue-listing.tsx`, `catalogue-browser.tsx` | NOT VERIFIED | Code has q, category, price bands, sort (name/price/newest) and a persisted Grid/List toggle. Price filter is fixed bands, no custom min/max | n/a | Exercise each filter with real data |
| Product page with bulk-order estimate and branding preview | `app/catalogue/[id]/page.tsx`, `bulk-order-estimator.tsx`, `branding-previewer.tsx` | NOT VERIFIED | Components present | n/a | Open a product, run the estimate and preview |
| Corporate products enquiry-based (no checkout) | `catalogue/[id]/page.tsx`, `checkout/layout.tsx`, `checkout/actions.ts` | PARTIAL (verified by code, tests) | No add-to-cart on corporate pages; B2B client users redirected away from `/checkout` and refused by `createCheckout`; B2B-only products refused at cart/checkout. Guard helper not unit-tested against a live session | n/a | Sign in as client, open `/checkout` (redirect) and call checkout (refused) |
| Request a Quote form | `request-quote/actions.ts`, `lib/site/upload-rules.ts` | PARTIAL, **FIXED (local)** | Server validation tightened (email, phone, quantity, lengths); invalid phone rejected in the browser at 375px; unit-tested. Saving the lead needs the DB; no rate limit (honeypot only) | rate limit needs design | Submit valid form, lead appears in CRM |
| Wishlist, About, sign-up, login, password reset | `app/wishlist`, `about`, `signup`, `login`, `forgot-password` | NOT VERIFIED | Pages exist and load; flows need Supabase Auth and Resend | n/a | Sign up, confirm email, log in, reset password |
| Installable app; signed-in pages never stored | `app/manifest.ts`, `public/sw.js`, `public/offline.html` | PARTIAL, **FIXED (local)** | Manifest valid; service worker caches only public list pages and icons, never `/crm`, `/portal`, `/checkout`, `/cart`, auth or per-product pages; offline fallback page added; `/?source=pwa` start URL now cached | done | Install on Android Chrome; go offline; confirm no private page is served from cache |

## Section 3.2 Personalised gifts store (p. 2)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Personalised catalogue, prices, Add to Cart | `catalogue-listing.tsx`, `quick-add-to-cart.tsx` | NOT VERIFIED | Purchasable only in personalized mode | n/a | Add to cart from card and detail |
| Personalisation: logo upload, name/initials, text, packaging/special instructions | `lib/products/customization.ts`, `product-customizer.tsx`, `personalized/customization-actions.ts`, `checkout/actions.ts` | PARTIAL, **FIXED (local)** | Upload now checks real file type from content, product exists/active/personalisable, UUID; checkout accepts only a path our upload could produce for that product. Required fields and an upload rate limit are now enforced | partly | Upload PNG/PDF; try renamed .exe (refused); buy a personalised item |
| Cart quantity changes; checkout validation (phone, PIN, email); review; payment | `cart/actions.ts`, `lib/checkout/validation.ts`, `checkout/*` | NOT VERIFIED | Server re-validates email, 10-digit Indian phone starting 6-9, six-digit PIN not starting with 0; prices re-resolved server-side | n/a | Walk the whole checkout with invalid inputs |
| MRP and discount on the personalised store only | `site-product-card.tsx`, `price-display.tsx`, `lib/catalogue/channel.ts` | PARTIAL, **FIXED (local)** | MRP is rendered only in personalised views and is now nulled out of corporate page data; unit-tested. Quotation "Discount" on portal is a quote discount, not MRP | done | View B2B pages and page source: no MRP |
| Delivery charge and free-delivery limit from Settings | `crm/settings/*`, `cart/actions.ts`, `checkout/actions.ts` | NOT VERIFIED | Read server-side; no values invented (client dependency 8.3) | n/a | Set values, confirm cart and checkout totals |
| Paid order auto-created with invoice and payment entry; unpaid creates no customer records | `checkout/order.ts`, `api/payments/payu/callback/route.ts`, `checkout/[id]/actions.ts` | PARTIAL, **FIXED (local)** | Order, invoice and payment are created only after a claimed paid payment. Order creation is now resumable (missing items/invoice/payment repaired on retry after 60 s) and a bad-hash POST no longer fails a payment. A payment stuck in `processing` or a paid payment without an order is now reconciled (route + finance button, unit-tested rules) | reconcile job needs design | Demo payment end to end; kill step mid-way and retry; duplicate callback |

## Section 3.3 Company and client management (p. 2)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Company records: industry, city, GST, owner, status, logo, notes | `crm/companies/*`, `schema.sql` companies | NOT VERIFIED | Columns exist (industry, city, gst_number, owner_id, status, notes, logo_path); status enum values not read in this audit | n/a | Create/edit a company, set each status |
| Contacts and client users linked to company; company-level access | `portal/*`, `client_company_id()`, RLS | BLOCKED | Server code scopes by `client_company_id()`; isolation is enforced in RLS | n/a | Two companies: each sees only its own data via UI and direct queries |
| Individual online customers separate from companies | `lib/companies/individual.ts`, `checkout/order.ts` | NOT VERIFIED | Separate handling in code | n/a | Online order creates an individual, not a corporate company |
| Client users invited by email | `crm/companies/actions.ts` (admin creates login), `crm/team/actions.ts` | PARTIAL | Admin creates client logins; email invitation for clients goes through the client-admin page below | n/a | Invite and accept |
| Client administrator manages own team | `portal/team/*` | **FIXED (local)** (was MISSING) | New page and actions: list, invite (always a plain client user in the caller's company, domain rule enforced), switch access on/off; admins cannot be changed; staff and other companies unreachable. Server logic only; not run against a database | done | Client admin invites and deactivates; client user cannot reach the page or actions; cross-company ids refused |
| Allowed email domains | `lib/companies/email-domains.ts`, `crm/companies/actions.ts`, `portal/team/actions.ts` | PARTIAL | Rules unit-tested; admin form; enforced on admin-created logins and client-admin invites. Self sign-up has no company so is not domain-linked (decision needed) | n/a | Domain refused/accepted on both paths (needs migration 3) |

## Section 3.4 Products and catalogues (p. 2)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Product fields (name, SKU, category, brand, price, MRP, MOQ, description, size, material, colours, photos) | `crm/products/*`, `product_variants`, `product_images` | NOT VERIFIED | Present in model and forms | n/a | Create a product with every field |
| Add one by one or CSV; Pricing & MRP tool with preview and history | `import-actions.ts`, `CatalogueCsvImporter.tsx`, `pricing/*` | PARTIAL (built) | CSV dry-run, row errors, duplicate protection, subcategory and sales-channel columns, template and guide. Pricing: export, preview, apply, history, batches and tested rollback logic. MRP list itself is a client dependency | done | CSV validate and import test products; price batch and rollback on 2-3 temporary products |
| Visibility: all / selected / internal | `catalogue_access`, `client_products` view | BLOCKED | UI and view exist; selected-company access is enforced in the DB | n/a | Selected product visible only to its companies |
| Catalogues: by search or by supplier, build, assign, publish, duplicate, edit | `crm/products/catalogues/*`, `lib/catalogues/candidates.ts` | NOT VERIFIED | Search and supplier modes, per-company assignment, publish/unpublish, duplicate all present in actions | n/a | Build from a supplier, assign two companies, publish, duplicate |
| Product channel (B2B / B2C / both) | `lib/catalogue/channel.ts` and call sites | PARTIAL (built, tested) | Hidden from the other storefront and refused by cart/checkout; rules unit-tested | n/a | Set each channel (migration 6), check storefront, portal, cart, checkout |
| Clients never see supplier names, costs, margins | portal pages, `client_products`, exports | BLOCKED (DB layer) / PASS by code review (pages, exports) | Portal catalogue reads a narrow view; portal quotation page now selects explicit columns; no supplier/cost fields found in client pages or exports. **Order costs are now protected at the database level by migration 10 (written, not run); product and supplier cost fields are protected the same way by migration 12 (written, not run; found and closed in the final audit: the public anon key could previously read `products.supplier_cost`) | SQL needs DB | As client, sales and operations: direct select of order cost columns must fail; as admin/accounts/management the Financials tab still works |

## Section 3.5 Requirements and quotations (p. 3)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Client creates a requirement (name, purpose list or typed, products, quantities, budget, deadline) | `portal/requirements/new`, `portal/actions.ts` | BLOCKED | Built with idempotency and the staged approval flow (RG-23 to RG-29); needs migration 2 | n/a | Scenarios A to E |
| Team records requirements on a client's behalf | `crm/requirements/new` | NOT VERIFIED | Staff-created requirements have no workflow stage, by design | n/a | Create as sales for a client |
| Quotation prepared from a requirement with items, quantities, prices, tax; sent to client | `crm/requirements/actions.ts`, `crm/quotations/*` | PARTIAL, **FIXED (local)** | Creation only from an approved selection. **New:** draft editor (add by SKU, quantity, unit price, per-line discount and tax, overall tax and discount, validity, notes), admin/sales only, draft only, totals recomputed by the database function; rules unit-tested | done | Edit a draft; try editing a sent quotation (refused); totals match a hand calculation |
| Client accepts or rejects item by item; accepted items become an order | `portal/quotations/[id]/*`, migration 8, `convert_quotation_to_order` | **FIXED (local)** (was MISSING) | New per-item decision UI with live accepted total; new database function records decisions and derives the quotation status; order creation uses accepted lines only and the accepted total. Falls back to the whole-quotation function for an all-accept/all-reject answer if migration 8 is absent. Totals/rules unit-tested; the SQL has not been run | SQL needs DB | Accept some items, reject others; order has only accepted items and the right value; all-reject marks the quotation rejected |
| Quotation notes are shown to the client | `portal/quotations/[id]/page.tsx` | PARTIAL | The notes field is client-visible by design ("Proposal Terms"); the editor says so. Staff must keep internal remarks out | n/a | Staff note review |

## Section 3.6 Orders and tracking (p. 3)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| One order list with type and payment status | `crm/orders/page.tsx` | PARTIAL, **FIXED (local)** | Type and payment badges existed; list now uses SOW stage names and has type and payment filters | done | B2B and B2C orders both appear; filters work |
| Eight stages with SOW names | `lib/order-workflow.ts`, `advance_order_stage` | PARTIAL, **FIXED (local)** | Enum maps to the eight stages; staff list, Control Center and customer-facing labels now use the SOW wording (`in_progress` remains a legacy extra) | done | Walk an order through all eight stages |
| Stage hand-offs with assignee, due date, comment; full history | `handOffOrder`, migration 9 | PARTIAL, **FIXED (local)** | Form had all fields; history rows previously lost assignee/due and duplicated; migration 9 stores them and removes duplicates; History tab shows the due date. Kanban moves still use a canned comment | SQL needs DB | Hand off with assignee, due date, comment; history shows one row with all three |
| Costing (product, printing, courier, other) and internal profit | `saveOrderCosting`, order detail Financials tab | NOT VERIFIED | Server-side recalculation; visible to admin, accounts, management only. Whether operations/sales should see it is a policy decision | n/a | Enter costs, profit matches; hidden from others |
| Courier and tracking details | `assignCourier`, order detail | NOT VERIFIED | Free-text fields; admin/operations only | n/a | Record courier and tracking number |
| Customer sees own order status and documents only | `portal/orders`, `portal/documents` | BLOCKED | Pages exist; scoping is RLS | n/a | Client sees only own orders |

## Section 3.7 Vendors and procurement (p. 3)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Supplier master (code, GST, payment terms, lead time, MOQ) | `crm/suppliers/*`, migration 20260925 | NOT VERIFIED | Columns and forms exist | n/a | Create supplier |
| Several suppliers per product with cost/MOQ/lead time, preferred, cost history | `products/supplier-actions.ts`, bulk tool | PARTIAL (built) | Existing mapping UI plus bulk assignment (CSV or SKU list, dry run, add or replace, create missing suppliers) with a tested planner | n/a | Bulk dry run then apply; cost history rows |
| Supplier per order line with cost snapshot and procurement status | `crm/orders/actions.ts`, `order-item-procurement.tsx` | NOT VERIFIED | Snapshot at assignment; ten procurement statuses | n/a | Assign supplier to a line |
| Printing vendors and courier partners | `partners/actions.ts`, `PartnerDirectory` | NOT VERIFIED | Create/edit/remove actions exist for suppliers, printing vendors and couriers (an earlier note that they were page-only was wrong) | n/a | CRUD each |
| Supplier-wise lists and counts; Orders and Cost by Vendor with CSV | `products` supplier filter, `suppliers/vendor-report/*` | PARTIAL (built, tested) | Supplier filter and counts; report with dates, vendor filter, `Not set` for empty costs, formula-injection-safe CSV, double permission gate | n/a | Totals vs a manual count |
| Subscribe catalogue import | bulk tool, CSV importer | PARTIAL / BLOCKED | Template, matching, linking, dry run built; vendor and catalogue files not supplied; nothing imported | files needed | Import approved files after a dry run |

## Section 3.8 Samples (p. 3)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Clients request samples from the shortlist and see status | `portal/shortlist/*` | NOT VERIFIED | Status badges on the shortlist page | n/a | Request, approve, see status |
| Team approves, fulfils, rejects | `crm/samples/actions.ts` | NOT VERIFIED | Status flow pending/approved/shipped/rejected | n/a | Each transition |
| Stock in office / with team / with client / pending supplier, movement history, responsible person | `crm/samples/*`, migration 9 | PARTIAL, **FIXED (local)** | Four locations exist. Defect fixed: moves to or from the team location were rejected by a CHECK after stock changed (migration 9) and stock is now restored if the ledger insert fails. History shows who moved the stock and the last 100 movements. Stock updates are still read-then-write in the app (race possible; `move_sample` RPC is atomic) | SQL needs DB | Move between all four locations; ledger row for each |

## Section 3.9 Finance, reports and administration (p. 3)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Invoices | `crm/invoices/*` | PARTIAL, **FIXED (local)** | Online orders get an invoice automatically. Corporate orders had no creation path: finance can now create the invoice from a delivered order (one per order, amount from the order) | done | Create invoice from a delivered B2B order |
| Payments | `crm/invoices/actions.ts`, `lib/finance/payment-rules.ts` | PARTIAL, **FIXED (local)** | `recordPayment` was open to any signed-in user with no amount checks: now finance only, validated, cannot exceed what is outstanding; unit-tested | done | Record partial and full payments; overpayment refused; non-finance refused |
| Receivables, GST reports | `crm/receivables`, `crm/gst-reports` | NOT VERIFIED | Pages exist | n/a | Compare with invoices |
| Payables | `crm/payables/*` | PARTIAL, **FIXED (local)** | Page was read-only with no way to create rows: finance can now add a payable and record payments (validated, no overpayment, conflict-safe); status values aligned with the database (`partial`) | done | Add payable, pay in two parts |
| Dashboard (leads, orders, revenue, pipeline); B2B/B2C views; labels | `crm/dashboard/page.tsx` | PARTIAL (built) | Revenue excludes cancelled orders; cards labelled "Order value (excl. cancelled)", "Collected (paid invoices)"; B2C tab uses paid payments only. Metrics definitions need client confirmation | n/a | Compare each card to a manual count |
| Reports, goals, tasks, activities, department view | `crm/reports`, `goals`, `tasks`, `activities`, `department` | PARTIAL, **FIXED (local)** | Goals, activities and tasks server actions were guarded only by login: now check the module permission server-side | done | Direct action calls as a role without the module are refused |
| Team directory, invitations, role settings, audit log | `crm/team`, `settings/permissions`, `audit-log` | PARTIAL (built) | Admin-gated; role templates (Manager, Order processing, Sales, Accounts) with tested contents | n/a | Apply each template; verify access matrix |
| Settings: organisation, tax, delivery charges, integration status, staff email | `crm/settings/*` | NOT VERIFIED | Present; staff email field appears after migration 5 | n/a | Save each setting |

## Section 3.10 Payments and notifications (pp. 3-4)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| PayU in demo mode, goes live with client details | `lib/payments/*`, `api/payments/payu/callback` | PARTIAL (demo) / BLOCKED (live) | Unit tests (no network): request hash, response hash, tamper rejection, fallback to demo. Amount-mismatch guard added; unverifiable callbacks no longer change payment state. Live PayU not integrated: credentials not supplied | n/a | PayU test then live checklist in `PENDING_WORK_AND_LAUNCH_CHECKLIST.md` |
| Email: password reset, invitations, system messages | `lib/email/*` | NOT VERIFIED | Templates and Resend sender exist; delivery not tested | n/a | Receive each email |
| WhatsApp to customers and staff for new orders, payment results, status changes, sample requests | `lib/notifications/*` | PARTIAL (outbox only) | Events queue in `notification_outbox` and are marked `skipped` without a provider or phone; extra events added (requirement, quotation, product available). `skipped` rows are re-queued once a provider is connected (safe rules, unit-tested) | done | Each event creates one outbox row; no duplicates |
| Staff email destination | `getStaffNotificationEmail` | PARTIAL | Used only when an admin saves an address; nothing invented | n/a | Alerts arrive at the saved address |

## Section 4 User roles and access (p. 4)

| Requirement | Code | Status | Evidence / gap | Fix w/o DB | Integration test later |
|---|---|---|---|---|---|
| Admin, Sales, Operations, Accounts, Management role scopes | `lib/modules.ts`, `module-access.ts`, layouts | PARTIAL | Module access enforced in each module's layout (page navigation) and, now, inside goals/activities/tasks actions; other actions rely on role checks and RLS | partly | Matrix: each role x direct URL x server action x export |
| Admins can change what each internal role may open | `settings/permissions` | NOT VERIFIED | Matrix and templates built; needs migration 1 | n/a | Toggle a module, role loses access |
| Client admin = client user + manage own team | `portal/team` | PARTIAL, **FIXED (local)** | Team page and actions restricted to client admin | n/a | Client user cannot open team page or call actions |
| Client roles cannot reach CRM, supplier data, other companies | portal layout, RLS | BLOCKED | Layout redirects non-client roles and vice versa; isolation relies on RLS | n/a | Cross-company and CRM URL attempts as a client |

## Section 5 Main business workflows (pp. 4-5)

| Journey | Status | Gap | Test later |
|---|---|---|---|
| 5.1 Corporate client journey | BLOCKED (end to end) | Every step now has code: shortlist, sample/requirement, approval flow, quotation, item-by-item acceptance, order, eight stages, courier/tracking, invoice from order, payment | Scenario A in section "Tests" |
| 5.2 Online customer journey | BLOCKED (end to end) | Demo payment path exists; live PayU pending | Scenario B |
| 5.3 Catalogue journey | BLOCKED (end to end) | Builder, assignment, publishing exist | Scenario C |

## Section 6 Client portal vs internal CRM (p. 5)

| Area | Status | Evidence |
|---|---|---|
| Portal exposes only permitted products, catalogues, requirements, quotations, own orders, sample status, documents and mockups | PARTIAL | Code review: catalogue via narrow view, explicit columns on the quotation page, requirement history shows only client-visible events. RLS is the actual boundary: BLOCKED |
| Internal CRM only for staff | PARTIAL | Layout and module gates; client users redirected |
| Never leak internal data through hidden controls | PARTIAL | Pages and exports checked; the direct-API cost-column exposure in section 3.4 is an open gap |

## Sections 7 and 8 Deliverables, work in progress, client inputs, outside scope

| Item | Status |
|---|---|
| 8.2 Notify a company's users when a product is made visible | PARTIAL (built, tested logic; delivery BLOCKED) |
| 8.2 Enforce allowed email domains at sign-up | PARTIAL: enforced for admin-created logins and client-admin invites; self sign-up unlinked by design pending a decision |
| 8.2 Corporate vs online dashboard, paid-only online revenue | PARTIAL (built) |
| 8.2 Order confirmation and status emails, order tracking page | PARTIAL (built; `/track-order` checked in browser, delivery BLOCKED) |
| 8.2 Vendor report, bulk supplier assignment, Subscribe import | PARTIAL (built); import BLOCKED by files |
| 8.2 Role templates | PARTIAL (built, tested contents) |
| 8.2 New arrivals, trending, festival banners | PARTIAL (built) |
| 8.2 Launch checklist | PARTIAL: see `PENDING_WORK_AND_LAUNCH_CHECKLIST.md` |
| 8.3 Client inputs (PayU details, WhatsApp account and templates, MRP list, Subscribe vendors and lists, delivery charge and limit, owner email, reference website, domain) | **Not supplied.** Nothing fabricated; features depending on them are off or in demo/outbox mode |
| 8.4 Mobile app, WhatsApp broadcasts, content/photography/data entry, training and support | Outside scope; not built. The broadcast specification exists as a document only |

---

## Gaps closed in the second pass (all need the database tests below)

| Gap | What was done | Status |
|---|---|---|
| Order cost columns readable through the data API | Migration 10 withdraws table-wide SELECT on `orders` / `order_items` and grants every column except the six cost columns and `supplier_cost_snapshot`. Authorised staff read costs through two permission-checked functions (`order_cost_summary`, `order_item_supplier_costs`). App code lists columns explicitly, reads costs through those functions (falling back to direct reads only until the migration is applied) and the vendor report now reads with the service role behind its two permission checks | **BLOCKED**: SQL not run. Rule defaults: admin, accounts, management see costs and margin; `suppliers.cost_view` holders see line supplier cost |
| Payment stuck in `processing`/`pending`, or paid with no order | `lib/payments/reconcile.ts` (tested): re-asks PayU's Verify Payment API for stale PayU payments (never marks paid without PayU confirming, amount compared), repairs paid payments with no order through the idempotent resumable order function, never touches demo payments, safe to repeat. Run by a CRON_SECRET-protected route `/api/payments/reconcile` and a finance-only button on Payments | Logic PASS (unit tests); live behaviour **BLOCKED** (needs database and PayU); scheduler to be set up after launch |
| WhatsApp messages skipped because no provider was connected | `lib/notifications/requeue.ts` (tested): only WhatsApp rows skipped for "no provider", with a phone, created within 7 days (`WHATSAPP_REQUEUE_MAX_AGE_DAYS`) go back to pending; email ledger rows, failed rows and rows with no phone are never touched. Runs from the existing dispatch cron route and from a "Re-send recent skipped messages" button (only shown when WhatsApp is connected) | Logic PASS; live **BLOCKED** (needs WhatsApp account) |
| Personalisation required fields | `validateCustomization` (tested) enforced at checkout on the server and in the add-to-cart button: logo, personalised text and initials are required when a product offers them; instruction boxes optional; length and format limits (initials 1-6 letters). **Assumption** recorded in code: which fields are required | PASS (rules); needs a client check of the assumption |
| Rate limiting of anonymous actions | Enquiry form (5 per 10 min), personalisation upload (10 per 10 min), order lookup (20 per 10 min). Shared database counter (migration 11, hashed client key, advisory-locked) with an in-memory fallback. Verified in the browser at 375px: the 6th enquiry in a row is refused with a clear message | In-memory path PASS in browser; database path **BLOCKED** |
| Sample stock read-then-write | `move_sample` and new `receive_sample` are single transactions with a row lock and return the movement id; the app calls them (with a fallback to the old path only until migration 9 is applied) | **BLOCKED** (SQL not run); concurrent-move test required |
| Product cost fields exposed (found during the audit: `products.supplier_cost`, `internal_margin`, `internal_notes` were readable with the public anon key through the public-catalogue policy, and `product_suppliers.supplier_cost` by every internal role) | Migration 12 withdraws API read access to those four columns (anon, clients and internal roles alike) and grants every other column. Authorised staff read them through `product_cost_summary` (admin, accounts, management) and `product_supplier_costs` (suppliers.cost_view). All wildcard product reads were replaced by explicit column lists; the product list, detail, requirement and company pages overlay costs only for permitted roles, and an editable cost field is shown only when the cost actually loaded (saving can never wipe a cost). Server-side cost reads (supplier assignment snapshot, cost history, bulk assignment) use the service role after their permission checks | **BLOCKED** (SQL not run). Isolated tests: stub-client tests for authorised, unauthorised, missing-function and error paths (an unauthorised refusal never falls back to a direct read); a drift test that the code's column lists equal the real table columns; a test that the migrations withhold exactly the cost columns and never grant them to anon; a source scan that fails on any wildcard read of products, orders, order_items or product_suppliers or any cost column named in a normal select |
| Kanban moves used a canned comment | Dropping a card now asks for an optional comment and stage due date, which go into the hand-off history | PASS (code), needs DB test |

## Known gaps that remain

1. Operations and sales cannot see order costing in the app today (secure default). **Decision needed** from you on which roles may see costs and margins; the one-line change location is documented in migration 10.
2. **Decision needed:** whether a self-registered user whose email domain is on a company's allowed list should be linked to that company automatically. Not implemented; an admin or the client's own administrator creates the link.
3. Cron scheduling is not configured (no `vercel.json`): `/api/payments/reconcile` and `/api/notifications/dispatch` need `CRON_SECRET` set and a scheduler pointed at them (every 10-15 minutes) after launch.
4. Rate limits are per client connection (IP); users behind one shared IP share the allowance.
5. **Decision needed:** sample purchase cost (`sample_stock.unit_cost`, `sample_movements.cost`) is readable by internal roles that handle samples (admin, sales, operations) and the page shows it to finance roles only. It was deliberately left unchanged because sales and operations enter it; tell me if it should be restricted like the other costs.

## Tests to run when Supabase returns

**Scenario A, corporate client:** login, company-specific catalogue, shortlist with notes, sample request, requirement, admin approval, client confirmation, product selection within budget, admin approval, quotation draft edited and sent, client accepts some items and rejects others, order contains only accepted items and the accepted total, eight stages with assignee/due date/comment and one history row each, courier and tracking recorded, invoice created from the delivered order, partial then full payment.

**Scenario B, online customer:** personalised product with logo upload, cart, checkout with invalid then valid phone/PIN/email, demo payment, one order + invoice + payment, duplicate callback creates nothing extra, tracking page by order number and email (wrong email gives the same message), customer receives confirmation and status emails.

**Scenario C, catalogue:** choose products by supplier, build and assign to two companies, publish, only those companies see it, duplicate it, client shortlists and requests a quotation.

**Scenario D, internal fulfilment:** order from Order Received to Delivered, sample stock moved through all four locations with history, vendor assigned per line, Orders and Cost by Vendor report matches a manual count.

**Security matrix:** every role x direct URL x server action x export; client A cannot read client B's orders, requirements, quotations, team or documents; client user cannot call team actions; non-finance cannot record payments, create invoices or payables; no supplier name, cost or margin in any client-facing page, email, export or API response (including a direct query as a client).

**Second-pass checks:**
- Product cost protection (migration 12): with the anon key `GET /rest/v1/products?select=supplier_cost,internal_margin,internal_notes` and `select=*` are refused while `select=id,name,price` still returns public-catalogue products; the same as a client, sales and operations user; `product_suppliers?select=supplier_cost` refused; as admin/accounts/management the product page and list show cost, as sales/operations they do not; a user with suppliers.cost_view sees supplier costs on the product and supplier pages and one without does not; edit a product and a supplier mapping cost and confirm nothing is blanked; assign a supplier to an order line and confirm the cost snapshot is recorded.
- Cost protection (migration 10): as client, sales and operations call `GET /rest/v1/orders?select=product_cost` and `select=*` (both refused) and `select=id,order_value` (works, rows still limited by RLS); as admin, accounts and management the order Financials tab and the dashboard margin card still show figures; vendor report still loads for a user with the cost permission and is refused for one without.
- Reconciliation: create a PayU test payment and abandon it; after 15 minutes run the finance button, the payment resolves from PayU's answer; break order creation after a verified payment, run it again, exactly one order, invoice and payment entry result; run twice, no duplicates.
- Requeue: with no WhatsApp credentials create an order (message skipped), connect WhatsApp, run the cron route or button, only recent messages with a phone are sent once.
- Personalisation: buy a product with each required field missing (refused on the server even if the button is bypassed).
- Rate limiting: with migration 11, six enquiries from one connection in 10 minutes, the sixth is refused; counters survive a server restart.
- Samples: two people move the same product at the same time, counts stay correct; a move to or from the team location is recorded.

**Per-migration checks:** run the verification query at the bottom of each of the twelve files.
