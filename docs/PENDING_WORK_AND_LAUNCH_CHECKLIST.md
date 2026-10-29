# Robust Gifting CRM: pending work, RG status and launch checklist

**STATUS 28 October 2026 (read this first).** Migrations 20261026 to 20261039 are **applied and verified** in Supabase project `zrfetfibatcuvwogyvjn`; about 225 real-database checks passed (details: `docs/DATABASE_MIGRATION_RUNBOOK.md` section 0). The 524 products are unchanged (fingerprint identical). **Critical blocker found: Supabase has restricted the project's data API (HTTP 402 `exceed_egress_quota`, Free plan): the B2C store, client portal, CRM and sign-in cannot reach the database for anyone.** Fix: upgrade the plan (or remove the spend cap) or wait for the quota to reset, then re-test. Until then every application-level test is BLOCKED. The rest of this file was written earlier and its migration table is kept as the record of what each migration is; where it says "apply" the work is done.

**Rechecked later on 28 October:** the data API is still HTTP 402. The external backup export and all application-level tests remain BLOCKED; the real-database tests are now saved in `scripts/db-tests/` and passed 223 of 223. A public-catalogue caching defect (an outage was cached for 60 s) was found and fixed (`scripts/test-catalogue-cache.mts`). While the API is down `/catalogue` shows "0 products / No gifts match" (safe but misleading).

**Open items, in order:**
1. Restore the data API (plan upgrade / quota reset), then run the CSV/JSON backup export (`C:\VI\Robust Gifting\db-backup-2026-10-28\export_backup.mjs`) and decide whether to drop the in-database snapshot `backup_20261028` (needs your approval; it is private and harmless).
2. Test the application against the live database: login for each role, portal and CRM pages, B2C checkout in demo mode, order tracking, reconciliation and notification endpoints, 375px layouts. Use `docs/MANUAL_TESTING_GUIDE.md`.
3. Concurrency checks (two simultaneous payments / sample moves) were not possible with the available tools.
4. Business decisions still open: which roles may see costs/margins; whether to approve the proposed `docs/proposed/20261040_order_costs_confirmed.sql`; company auto-linking by e-mail domain; real delivery charge and free-delivery threshold (currently 0 / empty).
5. Client inputs and credentials: real PayU keys, WhatsApp provider and approved templates, sender domain for e-mail, MRP list and supplier costs (no product has a cost yet), cron schedule and `CRON_SECRET`.

Earlier text: Written while the Supabase project was unavailable. Nothing marked BLOCKED or NOT VERIFIED had been run against a database. Unit tests (`scripts/test-*.mts`, run with `node --import ./scripts/register-alias.mjs scripts/<file>`) use no network and no database.

## 1. Migrations (apply manually in the Supabase SQL Editor, in this order)

| # | File | Purpose | App without it |
|---|------|---------|----------------|
| 1 | `20261026_module_permissions_and_catalogues.sql` | 36 `module.*` permissions, multi-company catalogues, client policies | role templates and catalogues disabled |
| 2 | `20261027_requirement_workflow.sql` | requirement approval workflow, history, quotation sync triggers | **client requirement list/creation fail** |
| 3 | `20261028_company_allowed_email_domains.sql` | `companies.allowed_email_domains` | domain check skipped |
| 4 | `20261029_pricing_batches.sql` | `batch_id`, `rollback_of` on price history | bulk price update works; Roll back hidden |
| 5 | `20261030_staff_notification_email.sql` | `org_settings.staff_notification_email` | no staff email is sent |
| 6 | `20261031_product_sales_channel.sql` | `products.sales_channel` (default `both`) and the B2B portal view filter | every product counts as `both` |
| 7 | `20261032_site_banners.sql` | `site_banners` table with RLS | no banners shown; admin page explains |
| 8 | `20261033_quotation_item_decisions.sql` | item-by-item quotation acceptance; order from accepted items only | whole-quotation response only |
| 10 | `20261035_order_cost_protection.sql` | order costs readable only through permission-checked functions | direct API reads of costs stay open |
| 11 | `20261036_rate_limits.sql` | shared rate limiting for public forms | in-memory limiter per server instance |
| 12 | `20261037_product_cost_protection.sql` | product and supplier costs readable only through permission-checked functions | direct API reads of product costs (including with the anon key) stay open |
| 13 | `20261038_security_hardening.sql` | sign-up can no longer grant a role/company, direct writes to requirement workflow fields refused, accepted-line helpers respect access, no overpayment, notification policies, task status `blocked` | a visitor could request the admin role at sign-up; workflow and payments rely on the application only |
| 9 | `20261034_order_history_handoff_and_sample_team.sql` | assignee/due date in order history, no duplicate history rows, sample moves to/from the team location | history without assignee/due; team moves fail |

| 14 | `20261039_function_execute_hardening.sql` | **new**: removes anonymous access to privileged database functions (`notify_users`, `assign_order`, record/recalc helpers), fixes the NULL-role bypass in `assign_order`, deactivated users lose database privileges, correct notification links | anyone with the public API key can create notifications and reassign orders |

**Apply by numeric order, except that the file numbers above list 34 last; run 34 right after 33.** Required ordering: 31 before 37; 33 and 38 in the same sitting. Status on 28 October 2026 (updated): **all of 26 to 39 are applied and verified** (they were absent in three earlier read-only checks that day). Batch A = files 26 to 32 (run first, then `docs/verification/batch-a.sql`); Batch B+C = files 33 to 39 in one maintenance session (no application use until 38 and 39 are verified, then `docs/verification/batch-bc.sql`). Order costing: option B decided and implemented (migration 33, `recalc_order_cost` in 39, shared four-state rule in `src/lib/orders/costing.ts`: profit is verified only when all four cost components are entered; otherwise provisional or hidden). **Your decision pending:** do you want the proposed `docs/proposed/20261040_order_costs_confirmed.sql` (lets staff confirm a genuinely zero component)? It is not part of the 14 migrations and nothing depends on it. Free plan, no automatic backups: export the tables listed in `docs/DATABASE_MIGRATION_RUNBOOK.md` section 3 first, and run the batch verification queries in section 5 after each batch.

All are additive and idempotent. Verification queries are at the bottom of each file. Migration 2 is the only one the shipped code depends on (the full scope-of-work audit is in `docs/SOW_COMPLIANCE_MATRIX.md`); apply 1 and 2 first.

## 2. Requirement status RG-01 to RG-29

Status key: DONE (built and checked locally), BUILT (built, needs DB to verify), PARTIAL, MISSING, CLIENT (waiting for client input).

| ID | Item | Status | Notes |
|----|------|--------|-------|
| RG-01 | B2B/B2C switch | DONE (code review) | Existing header switch with cookie persistence (`gift-mode`); browser persistence check recorded in the test log |
| RG-02 | B2C store, customization, checkout | BUILT | Server-side price re-resolution, demo payment, delivery settings; customer order confirmation and status emails added (Resend, once per event) |
| RG-03 | Shortlist / interest list | BUILT | Shortlist is the UI label; it stores the interest list (`company_product_interests`). Client wording "Add to Interest List" maps to it |
| RG-04 | Samples | BUILT | Staff email, WhatsApp outbox and in-app alerts on request |
| RG-05 | Order tracking, validation, PayU hardening | DONE / CLIENT | `/track-order`, amount-mismatch guard, hash tests; PayU credentials from client; no stock/inventory model exists (excluded from MVP) |
| RG-06 | Requirements | BUILT | Full workflow RG-23 to RG-29 |
| RG-07 | CSV import | DONE | Validate (dry run), row errors, duplicate warnings, subcategory and sales channel columns, template, five-step guide |
| RG-08 | MRP and pricing | BUILT | Export, preview, apply, history, batches and safe rollback. Real MRP list: CLIENT. Test on 2–3 temporary products: BLOCKED |
| RG-09 | Dashboard B2B/B2C, revenue | DONE / BUILT | View tabs (All, B2B, B2C), revenue excludes cancelled orders, B2C paid revenue from paid payments only |
| RG-10 | Launch readiness | PARTIAL | See section 7 |
| RG-11 | Categories and subcategories | BUILT | Add/edit product and CSV, with category/subcategory consistency check |
| RG-12 | Product channel | BUILT | B2B / B2C / both; hidden from the other storefront, cart and checkout enforce it server-side |
| RG-13 | Role templates | DONE / BUILT | Manager, Order processing, Sales, Accounts (Admin always has all); applying needs migration 1 |
| RG-14 | Company onboarding, allowed domains | BUILT | Admin form; enforced when an admin creates a client login. Self sign-up has no company, so it is not domain-linked (decision needed, section 5) |
| RG-15 | Multi-vendor sourcing | BUILT | Existing; bulk assignment adds CSV and SKU-list with dry run |
| RG-16 | Supplier-wise lists, vendor report | BUILT | Supplier filter on Products, counts link to it; Orders & cost by vendor with date/vendor filters and CSV, "Not set" when cost is empty |
| RG-17 | Vendor catalogue importer ("Subscribe") | PARTIAL / CLIENT | Template, matching/creation of suppliers, linking, dry run and error report are built. Real vendor and catalogue files not supplied; nothing imported |
| RG-18 | WhatsApp events | BUILT | See section 4. Credentials and templates: CLIENT |
| RG-19 | Broadcast and carousel | SPEC ONLY | Section 4 |
| RG-20 | PWA and native note | DONE (review) | Section 6 |
| RG-21 | New arrivals, trending, recently viewed, banners | DONE / BUILT | New arrivals from created date (hides when none); trending uses real shortlist/order activity with fallback; recently viewed in the visitor's browser; banners managed in CRM |
| RG-22 | Reference website look and feel | CLIENT | Reference link not supplied. Design hooks: `store-eyebrow`, `store-section-title`, `SiteProductCard`, `HeroStage`, `ProductRail`, header/footer in `SiteShell` |
| RG-23 | Portal lands on Products | DONE | |
| RG-24 to RG-29 | Requirement approval flow | BUILT | Needs migration 2 |

## 3. Blocked by the database or by client input

| Item | Why | Steps when unblocked |
|------|-----|----------------------|
| All workflow and role/RLS end-to-end tests | need migrations and logins | section 8 |
| Allowed-domain, subcategory, channel, banner, batch rollback, staff-email checks | need migrations 3 to 7 | apply, then run the matching test in section 8 |
| MRP temporary-product test | needs live data | create 2 clearly named test products, bulk update, verify history and B2C struck-through MRP, roll back, verify restoration, delete by exact id |
| Subscribe catalogue import | client files not supplied | import products with the CSV importer (dry run first), then map vendors with Bulk supplier assignment |
| PayU live | client credentials | section below |
| WhatsApp live | access token and approved templates | section 4 |

PayU Go Live (demo mode stays until done): set test key, salt, `PAYU_ENVIRONMENT=test`, `PAYMENT_PROVIDER=payu` in Vercel; run success, failure, cancel and duplicate callbacks and confirm one order per payment; confirm callback URL `/api/payments/payu/callback` is allowed in the PayU dashboard; confirm the amount-mismatch guard; then live key and salt, one low-value live payment and refund; confirm delivery charge and free-delivery threshold in Settings. Removing `PAYMENT_PROVIDER` returns to demo mode.

## 4. WhatsApp and broadcast

Architecture kept: events are queued in `notification_outbox` and sent through the WhatsApp Cloud API when `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` exist; otherwise rows are `skipped` (also `skipped` with a reason when there is no phone). No WATI adapter without approval. Email goes through Resend and is recorded in the same outbox (channel `email`) so a repeated action never sends twice.

| Event | Customer | Staff |
|-------|----------|-------|
| Order created | WhatsApp, email (online store orders) | WhatsApp, configured staff email |
| Payment success / failed | WhatsApp | none |
| Order status changed | WhatsApp, email (online store orders) | WhatsApp |
| Sample requested | WhatsApp | WhatsApp, staff email |
| Requirement submitted / resubmitted / client confirmed / selection submitted | none | WhatsApp, staff email |
| Requirement approved / changes requested / rejected; selection approved / changes requested | WhatsApp, email, in-app | none |
| Quotation sent | WhatsApp, email, in-app | none |
| Quotation accepted / declined | none | WhatsApp, staff email |
| Product made visible to a company | WhatsApp, email, in-app to that company's users only | none |

Templates to register in WhatsApp Manager (parameters in this order): `requirement_update_customer` (customer_name, requirement_name, update), `requirement_update_staff` (company_name, requirement_name, update), `product_available_customer` (customer_name, product_summary), plus the existing order, payment and sample templates.

### Broadcast and carousel specification (RG-19, not built)

Purpose: tell opted-in corporate customers about new arrivals and festival offers without staff messaging them one by one.

1. **Audience**: portal companies (all, or a chosen list); only users with a valid phone who have opted in; an unsubscribe keyword must be honoured.
2. **Content**: a campaign has a name, an occasion, a message template, and either a single image or a carousel of 2 to 10 product cards (image, name, price shown only if the approver allows it, link to the portal product). Cards come from the products visible to each recipient's company, so one company never sees another's catalogue.
3. **Approval steps**: draft, preview to a test number, internal approval by an admin, then scheduled send. Nothing is sent without approval.
4. **Supported messages**: WhatsApp marketing templates approved by Meta (a carousel template needs its own approval), and a matching email version through Resend.
5. **Delivery**: one `notification_outbox` row per recipient with dedupe key `broadcast:{campaign_id}:{profile_id}`; batched sends within the provider rate limit; status shown per campaign (sent, failed, skipped, with reasons).
6. **Reporting**: counts only. No invented engagement or popularity figures.
7. **Dependencies**: client WhatsApp Business account and template approvals, an opt-in capture and unsubscribe field on profiles, the decision on WhatsApp versus email, and a new `broadcast_campaigns` table with RLS. Estimated as a separate phase.

## 5. Decisions needed from the client or product owner

- Staff alert email address (enter it in Settings once the migration is applied; nothing is sent until then).
- Whether self sign-up users should be auto-linked to a company by allowed email domain. Currently they are not (safer): an admin creates or links logins.
- Vivek's email for the admin invitation, and whether "Vivek's Gifting" needs a ready end-user login.
- Reference website for RG-22; delivery charge and threshold; MRP list; vendor list and catalogue files.

## 6. PWA and native app

Manifest has icons (192, 512, maskable), standalone display, scope and start URL. The service worker caches only public pages and icons; `/crm`, `/portal`, `/checkout`, `/cart` and auth pages always go to the network, so signed-in data is never cached. Android Chrome install: NOT VERIFIED on a device.

Native app scope note (not authorised): (1) wrap the existing portal first as a PWA/TWA; (2) native only if push notifications or camera features are needed; (3) one codebase (React Native or Flutter); (4) reuse the same Supabase auth and server actions through an API layer; (5) screens: catalogue, shortlist, requirements, approvals, quotations, orders; (6) push notifications replace WhatsApp for in-app events; (7) offline limited to read-only catalogue; (8) app store accounts and review lead time; (9) separate maintenance cost; (10) estimate only after the PWA is in client hands.

## 7. Launch checklist

| Item | Status |
|------|--------|
| Custom domain | CLIENT. Set `SITE_URL` (https) when live; sitemap and robots use it and publish nothing without a known domain |
| SEO titles and descriptions | PARTIAL: root metadata plus product, request-quote, track-order pages; per-category titles exist |
| Sitemap, robots.txt | DONE (code). Open Graph: product pages set OG title/description/image; a default site image is CLIENT |
| 404 and 500 pages | DONE (`not-found.tsx`, `error.tsx`, `global-error.tsx`) |
| Quote and contact forms, email delivery | BUILT; Resend domain verification and sending NOT VERIFIED |
| Security headers | DONE: nosniff, frame options, referrer policy, permissions policy, HSTS. No CSP yet (needs its own tested rollout) |
| Migrations 1 to 7 applied | BLOCKED |
| End-to-end tests (section 8) | BLOCKED |
| 524 products unchanged | BLOCKED (count, SKUs, prices, images, supplier links) |
| PayU and WhatsApp credentials | CLIENT |
| Lighthouse before/after | NOT RUN (needs the live catalogue) |

## 8. End-to-end tests to run when the database returns

Requirement workflow (scenarios A to E): success flow through to accepted quotation and order; reject and request-changes loops (note required); budget and quantity validation, over-budget acknowledgement; security (cross-company isolation, client cannot call staff transitions, sales sees own only, no internal notes or supplier data in client views, emails and exports); retry and duplicates (double-click, repeated decision, second draft quotation).

Roles: admin, order processing, sales, accounts, manager. For each: direct URL access, server actions, API/export routes (`/crm/suppliers/vendor-report/export`, template downloads), and supplier or cost fields hidden without `suppliers.cost_view`. Apply each role template, then confirm the matrix.

Catalogue: set a product to B2B only (absent from the B2C store, cart and checkout rejects it), to B2C only (absent from the portal), and back to both. Banners: create, schedule, expire, hide; confirm portal-only and public-only audiences. Pricing: bulk update, history, rollback, rollback after a later manual edit (must skip that product). Suppliers: bulk assignment dry run then apply (add and replace), supplier filter and counts, vendor report totals against a manual count, `Not set` where cost is empty.

Notifications: product visible only to one company notifies only that company's users; each event in section 4 produces one outbox row (or `skipped` with a reason) and one email; repeating an action creates no duplicates.

## Client demonstration checklist (29 Oct 2026)

Safe to show (verified on the live database): public catalogue and product pages with the 524 products, mobile layout, quotation form validation, order tracking with generic errors, the 404 page, and the rule that payments can never exceed an invoice.

Show only after a signed-in walkthrough by you (not yet exercised live): CRM dashboard and finance figures, B2B portal for two companies, order stages, sample stock, team and roles.

Do not demonstrate as working: real PayU payment (demo mode only), real e-mail (Resend key present, nothing sent), real WhatsApp (outbox only), cost and profit as final (Option B shows provisional or not entered when costs are missing).

Before the demo: sign in as admin, accounts, sales and a client from two companies and run section 3 of `MANUAL_TESTING_GUIDE.md`; decide whether Resend may send real mail; give the products real names and descriptions.
