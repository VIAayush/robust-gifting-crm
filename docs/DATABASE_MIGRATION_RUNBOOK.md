# Database migration runbook — migrations 20261026 to 20261039

Status: **APPLIED AND VERIFIED on 28 October 2026 (all 14 migrations, 20261026 to 20261039)** to the live project
`zrfetfibatcuvwogyvjn` (robust-gifting-crm). Sections 1 to 8 below are the pre-migration review and are kept as the record of
why each migration exists; section 0 is what actually happened.

## 0. What actually happened on 28 October 2026 (applied by Claude under the owner's written authorisation)

The owner authorised direct application provided a backup was taken and verified and the project identity was confirmed.

| Step | Result |
|---|---|
| Project identity | Supabase project id `zrfetfibatcuvwogyvjn` (name robust-gifting-crm), the same reference as the application's `.env`, database `postgres` |
| Data API state | **Restricted by Supabase: HTTP 402 `exceed_egress_quota`** for REST, Auth and Storage, even for anonymous requests (Free plan). The site/API is down for everyone until the plan is upgraded or the quota resets. Only the management SQL channel works. |
| Backup | Free plan has **no automatic backups**. A file export through the data API was impossible (402). Instead a verified full-fidelity snapshot of all 11 tables was taken **inside the database** in the private schema `backup_20261028` (no API access, RLS on): every table's row count and md5 equal to its source (products 524 `676223b6…`, product_suppliers 524, profiles 16, role_permissions 28, permissions 12, companies 12, orders 2, order_items 2, notifications 2, org_settings 1, tasks 0), plus table `backup_20261028.definitions` with 72 saved definitions (20 functions with ACLs, 26 policies, view, constraints, 10 table ACLs, 12 triggers). Manifest: `C:\VI\Robust Gifting\db-backup-2026-10-28\README.txt` (and the file-export script `export_backup.mjs` to run once the API is restored). **The snapshot schema still exists; drop it only with the owner's approval.** |
| Batch A (26 to 32) | Applied one file at a time, each verified; `docs/verification/batch-a.sql`: **all 24 checks and query 2 PASS** |
| Batch B+C (33 to 39) | One maintenance session in file order. 33, 34, 35, 36, 37, 38 applied and verified individually. **39 FAILED on its first run**: `ERROR 42P13 cannot remove parameter defaults from existing function` (my `CREATE OR REPLACE` for `assign_order` and `record_campaign_event` omitted the live functions' parameter defaults; the offline parser cannot catch this). The whole file was one implicit transaction, so it rolled back completely (verified: every old definition intact, nothing partial). The file was corrected (defaults added), a regression test `scripts/test-migration-signatures.mts` was added (it fails on the old text, verified), and 39 was applied cleanly. |
| Function integrity | The `md5(prosrc)` of **all 30 functions** created or replaced by the migrations equals the md5 of the same body in the migration files: **30/30 identical** |
| `docs/verification/batch-bc.sql` | **all 36 checks and query 2 PASS** |
| Products | 524 total, 524 active, 474 `HGS-`, 524 distinct SKUs, 524 with image, `client_products` 524, `sales_channel` = `both` for all 524, fingerprint `60e683d350cd7e55a474b2b86ec87aab` **identical before and after** |
| Other data | role_permissions 28 → 139 (+111), permissions 12 → 48 (+36), notification link repair (38 §6) changed 0 rows (both existing links were already correct; compared with the snapshot), audit_logs 6,653 unchanged, 2 orders unchanged, 16 profiles unchanged |
| Optional audit scrub (38) | **Not run** (not approved, not needed: 0 historic audit rows hold a non-zero cost value) |

### Real-database tests (all run as the actual database roles inside transactions that were deliberately rolled back; nothing persisted, re-verified afterwards)

Impersonation was done with the same mechanism PostgREST uses (`SET ROLE anon|authenticated|service_role` plus the JWT claims), so grants, RLS, triggers and `SECURITY DEFINER` functions were exercised for real, using the 16 existing accounts (no account was created or changed).

| Run | Area | Checks | Result |
|---|---|---|---|
| 1 | Sign-up escalation (metadata `role=admin` → `client_user`, admin-API `app_metadata` still honoured, invalid role falls back), 18 privileged functions refused to `anon`, signed-in callers without the role refused, missing-profile caller refused (the NULL-role bypass), deactivated staff lose database powers, cost columns unreadable by anon/clients/sales/operations and even admin directly, cost readers gated by role / `suppliers.cost_view`, audit visibility, new audit rows redacted, notification insert/update rules | 89 | **89 PASS** (88 at first run; S6l was a flawed check counting the order's pre-migration audit rows; re-verified on new rows only: 0 cost keys, `restricted_fields_changed` present) |
| 2 | Requirement isolation, invalid transitions and direct stage writes refused, full client/admin lifecycle (approve, confirm, select, approve selection), idempotent double click, frozen budget, internal notes hidden, quotation guard and unique draft, totals, quotation follows requirement, cross-company quotation lines hidden including through `quotation_accepted_items()` (the migration-33 exposure), expired quotation refused whole and item by item, sample stock (atomic: a failed ledger insert rolled the stock change back; `team` location; insufficient stock; no negatives), rate limiter | 87 passed | **87 PASS**; the other 17 rows were my script's mistakes (W3k expected 5 visible events, the correct number is 4; my script called the converter as a superuser with no identity so the order-dependent tests did not run) and were rerun in run 3 |
| 3 | Item-level decisions to order (only accepted line, value 236.00), duplicate conversion returns the same order, **Option B costing against the real database** (all costed = 230; one unknown or zero or NULL line = 0; profit 0), `recalc_order_cost` stores profit only when all four components exist (552.00 only after all four), invoices (unique per order), payments (overpay, zero, negative, edit past total refused; exact settle → paid), eight fulfilment stages with exactly one history row each, assignee/department/due date kept, tasks, per-stage client notifications, isolation of client B | 50 | **49 PASS**; W5a3 was a mislabelled test (random quotation id gives "Quotation not found", which is correct) |

**Saved and rerunnable:** the three runs above are now the files `scripts/db-tests/01-security.sql`, `02-requirements-quotations-samples.sql` and `03-orders-costing-finance.sql` (README in the same folder). After correcting the harness (summary query column clash, a volatile call inside a `WHERE`, NULL results now counted as failures) and two wrong expectations, the saved scripts were rerun: **89/89, 83/83 and 51/51, 223 of 223 passed**, `failed: []`, and the database was verified unchanged afterwards. Paste one file into the SQL Editor and read the `RESULTS {...}` JSON in the (deliberate) error.

Not verifiable with the database tools available (recorded as such, not guessed): concurrent payments from two sessions (the code uses a row lock `FOR UPDATE`, checked by text and by the sequential behaviour above), concurrent sample moves (same: `FOR UPDATE`), HTTP-level behaviour through PostgREST and Auth (the API is restricted, HTTP 402), the Next.js application against the live database (login needs the API), and real PayU / Resend / WhatsApp.

---

## 1. What the live database looks like today (read-only inspection, 2026-10-28)

| Check | Result |
|---|---|
| Migrations 20261026–20261038 applied? | **None.** Every table, column, function, trigger and policy they create is absent (checked object by object). |
| Supabase migration history table | Stops at `20261005…`. The SQL Editor does not record history, so this table is not evidence either way; the object checks above are. |
| Earlier Sept migrations (supplier architecture, MRP/orders/notifications) | Their objects exist (`product_suppliers`, `notification_outbox`, `mrp` columns, `move_sample`, `advance_order_stage`). |
| Isolated target (Supabase branch / scratch DB)? | **None.** `list_branches` is empty and the organisation is on the **Free plan**. Production is the only database. |
| Backups | **Free plan: no automatic backups and no point-in-time recovery.** Take the manual exports in section 3 first. |
| Products | **524** total, 524 active, 474 `HGS-` SKUs, 524 distinct SKUs, 524 with an image. Fingerprint (md5 of id, name, sku, price, image_url, supplier_id for all rows, ordered by id): `60e683d350cd7e55a474b2b86ec87aab`. |
| Client portal view `client_products` | 524 rows. Migration 31 must leave this unchanged. |
| Other data | 12 companies, 16 profiles, 2 orders (B2C), 0 requirements, 0 quotations, 0 invoices, 0 payments, 0 campaigns, 0 sample movements, 524 product-supplier rows (0 with a cost), 6,653 audit rows. |
| Cost values stored | Product supplier cost / margin / notes: **0 rows have a value**. Historic audit rows holding a non-zero cost value: **0**. The optional audit scrub in migration 38 is therefore **not needed today**. |

### Defects found in the live database (these are what the migrations fix)

| # | Severity | Finding | Fixed by |
|---|---|---|---|
| L1 | **Critical** | `handle_new_user` takes `role` and `company_id` from `raw_user_meta_data`, which a visitor controls through Supabase Auth sign-up, and defaults to `sales`. Anyone able to sign up could ask for `admin`. (Not exploited; confirmed from the function source.) | 38 §1 |
| L2 | **High** | `notify_users` has no caller check and `anon` can execute it, so anyone with the public API key can create in-app notifications (any company, any text and link). | 39 |
| L3 | **High** | `assign_order` checks `v_role NOT IN (...)`. `current_role()` is NULL for a caller with no profile, so the test is NULL and never raises: an anonymous caller can reassign orders. The app never calls this function. | 39 |
| L4 | Medium | `record_campaign_event`, `recalc_order_cost`, `recalc_quotation_totals`, `refresh_invoice_status` have no caller check and `anon` can execute them (unauthenticated writes; recalculations are idempotent so the damage is limited to log forgery for `record_campaign_event`). 37 definer functions in total are anon-executable (Supabase security advisor, lint 0028, confirms). | 39 |
| L5 | Medium | `has_any_role`, `is_admin`, `current_role` ignore `profiles.is_active`; a deactivated staff account keeps every `can_*()` privilege in the database. | 39 |
| L6 | Medium | `audit_logs.audit_select` lets a user read every audit row they caused (`user_id = auth.uid()`), and `write_audit()` copies whole rows, cost columns included. No cost value is stored yet, so nothing has leaked. | 38 §8 |
| L7 | Medium | `products` / `orders` / `order_items` / `product_suppliers` cost columns are readable through the API by `anon` (products) and every signed-in role. No value stored yet. | 35, 37 |
| L8 | Medium | `notifications_update` has `WITH CHECK true` (a user can rewrite title/link of notifications they may update); `notifications_insert_internal` lets any client insert notifications. | 38 §5 |
| L9 | Low | `sample_movements` check constraints reject `team` although `sample_stock.with_team` exists, so a team move changes stock and then fails to log. `tasks_status_check` rejects `blocked` that the screens offer. | 34, 38 §7 |
| L10 | Low | Notification links `/orders/<id>` and `/quotations/<id>` point at pages that do not exist (should be `/crm/...`). | 33, 38 §6, 39 |
| L11 | Info | `anon` and `authenticated` hold the Supabase default table privileges (including `TRUNCATE`, `REFERENCES`, `TRIGGER`) on every public table. RLS protects rows; `TRUNCATE` is not reachable through the REST API. Hardening idea only, not part of this sequence. | not changed |
| L12 | Info | Eight views (`client_products`, `portal_*`, …) are owned by `postgres` and run with owner rights by design (they expose only safe columns). The advisor reports this as lint 0010. They are multi-table join views and therefore not updatable. | by design |
| L13 | Info | `convert_quotation_to_order` falls back to `price × 0.62` as the product cost when a product has no `supplier_cost`. This invented margin assumption comes from an older migration. **Decided (option B) and fixed in migration 33.** | 33 |
| L14 | Medium | `recalc_order_cost` stores `gross_profit = order value − whatever costs exist`, so an order with no or partial costs reports almost its whole value as profit, and the dashboard "Gross margin" card summed that. The function also had no caller check (any signed-in user, and `anon`, could call it). **Found in this session's code review.** | 39 (database rule + role check), application (shared costing rule used by the order page and dashboard) |
| L15 | Medium | Server actions that read the profile themselves (`updateTeamMember`, `updateOrgSettings`, order costing and others via `getProfile()`) did not check `is_active`, so a deactivated admin with a live session could still change roles, settings and costs. **Found in this session's code review.** | application (code, already in the working tree; regression test `test-actions-deactivated.mts`) + 39 for the database helpers |

---

## 2. Order to run (14 files, strictly in this order)

**Plan as of the second preflight (28 Oct 2026, state re-confirmed: still nothing applied, application database ref `zrfetfibatcuvwogyvjn`):**

- **Batch A (26–32) can be run now.** It is additive and does not depend on any decision.
- **Batch B+C (33–39) is ONE maintenance session.** Decision D1 is made (option B, implemented in 33). **Do not open or use the application between 33 and 38, and do not resume normal use until 38 and 39 have both succeeded and Claude has verified them read-only.** (Between 33 and 38 any signed-in user could read other companies' quotation lines; until 39 anonymous callers can still call privileged functions.) Run 33 → 34 → 35 → 36 → 37 → 38 → 39 back to back; run the verification queries after 39 (or after each file if you prefer, still without opening the app). The local dev server is stopped during this work; production traffic is the concern, so if the live site is in use, do the session at a quiet time.
- If anything fails, stop; do not re-run a partially failed file blindly (see section 3, "If a file fails").

### Decision D1 (needed before migration 33): unknown product cost

`convert_quotation_to_order` (live today, and re-created by 33) records an order's cost as `coalesce(product.supplier_cost, price × 0.62)`. 0 of the 524 products and 0 of the 524 supplier mappings have a cost, so **every order converted from a quotation would show an invented 38% margin**. The order cost columns are `NOT NULL DEFAULT 0` (cannot hold "unknown"), and the order page already shows "costs not entered" instead of profit when `total_cost = 0`.

| Option | Effect | Recommendation |
|---|---|---|
| A. Keep 62% | Invented margin on every converted order | No |
| B. **Unknown = not entered (recommended)** | If any accepted line has no cost, the order is created with costs 0 and profit 0; the page shows "costs not entered"; staff enter real costs on the order's Financials tab (existing screen). If every line has a cost, the sum is used. No schema change. | **Yes** |
| C. Block conversion until every line has a cost | Honest, but with 0 costs in the data **no quotation can become an order** until the client supplies all costs | Only if you want to force cost entry first |
| D. Allow NULL cost columns | Needs a schema change and changes to dashboards and exports | Later, if wanted |

**DECIDED: option B (approved 28 Oct 2026).** Implemented in `20261033_quotation_item_decisions.sql` (local change, not applied): a line counts as costed only when `products.supplier_cost > 0`; if any accepted line is not costed, the order is created with `product_cost = total_cost = 0` and `gross_profit = 0`; otherwise cost is the sum of actual costs. **Exact criterion for "verified cost":** the database has no "verified" flag, so a line is treated as costed only when its product's `supplier_cost` is not NULL and greater than 0. A NULL, 0 or negative value is never used as a cost. The preferred-supplier mapping cost (`product_suppliers.supplier_cost`) and the per-line `supplier_cost_snapshot` are **not** consulted (the previous function did not either); a business rule to prefer them would be a separate decision. **After the order exists (shared rule in `src/lib/orders/costing.ts`, used by the order page, the dashboard and `recalc_order_cost`).** The four order cost columns are `NOT NULL DEFAULT 0`, so **a stored 0 cannot be told from "not entered yet"**; this limitation is stated on screen. Product-cost completeness and whole-order completeness are separate flags, giving four states:

| State | Condition | What is shown |
|---|---|---|
| Not entered | total cost 0 | "Costs not entered"; no profit, no margin |
| Incomplete | some cost entered, product cost 0 | "Product cost not entered, so profit and margin are not shown"; nothing else |
| **Provisional** | product cost > 0 but printing, courier or other is 0 | "Provisional profit / margin" in amber with the sentence that the system cannot tell a real zero from a cost not yet entered; **never counted in dashboard totals**, never stored as profit |
| **Verified** | product, printing, courier and other cost **all > 0** | "Gross profit" and "Margin"; counted in the dashboard; stored by `recalc_order_cost` |

Consequences: a converted order (the conversion fills only the product cost) is at best Provisional until staff enter the other three; an order with a genuinely zero component (e.g. no printing) also stays Provisional, because that cannot be confirmed without a schema change. The stored `gross_profit` always means **verified profit only** (0 otherwise), and the conversion stores 0. The dashboard card "Gross margin (fully costed orders)" sums verified orders only and says "N fully costed, M provisional (not counted), K not costed, of T orders". The vendor report already excludes unknown costs from margin totals.

**Proposed (not applied, for your review): `docs/proposed/20261040_order_costs_confirmed.sql`.** It adds `orders.costs_confirmed_at/by` so staff can confirm "the costing is complete, a zero means zero"; a confirmed order with a product cost is then Verified even with zero components, and editing any cost withdraws the confirmation. It is additive, parses, and is deliberately outside `supabase/migrations/`; it also needs a small application change (checkbox, `confirm_order_costs` call) that has not been made. Decide whether you want it; nothing depends on it. The old 62% assumption is gone from the file (`scripts/test-order-cost-rule.mts` pins this; syntax check passes). `supabase/schema.sql` is the original baseline snapshot and still shows the old function; the live function is replaced by migration 33.

**Order cost rule, checked after apply (needs test records, so only with your approval):** convert a ZZ-TEST quotation whose product has no cost → order cost 0 and the order page shows "costs not entered"; convert one whose product has `supplier_cost = 40` for quantity 3 → `product_cost = 120`; then as Admin save only a printing cost on the first order → `total_cost` = that cost, **`gross_profit` stays 0**, and the page says "Product cost not entered, so profit and margin are not shown"; then add a product cost but leave courier and other at 0 → `gross_profit` **still 0** (stored profit is verified only) while the page shows an amber "Provisional profit"; enter all four → `gross_profit = order_value − total_cost`; as a Sales user, calling `recalc_order_cost` is refused.

Run each file **as one Run in a fresh SQL Editor tab**. Expected result for every file is
`Success. No rows returned` (the `select` verification lines are comments).
Run the verification queries in section 5 after the batch noted, then stop and tell Claude.

| Batch | File | Why this position |
|---|---|---|
| A | `20261026_module_permissions_and_catalogues.sql` | Module permissions and multi-company catalogues. Needed by 39. |
| A | `20261027_requirement_workflow.sql` | Requirement approval workflow. Needed by 38. |
| A | `20261028_company_allowed_email_domains.sql` | |
| A | `20261029_pricing_batches.sql` | |
| A | `20261030_staff_notification_email.sql` | |
| A | `20261031_product_sales_channel.sql` | **Must run before 37** (37 grants SELECT per existing column; `sales_channel` must already exist). |
| A | `20261032_site_banners.sql` | |
| B | `20261033_quotation_item_decisions.sql` | Needed by 38. Its `quotation_accepted_items` is `SECURITY DEFINER` until 38 replaces it, so **run 38 in the same sitting**. |
| B | `20261034_order_history_handoff_and_sample_team.sql` | Atomic sample movement. Drops and recreates `move_sample` (return type changes to uuid). |
| B | `20261035_order_cost_protection.sql` | Column grants on `orders` / `order_items`. |
| B | `20261036_rate_limits.sql` | |
| B | `20261037_product_cost_protection.sql` | Column grants on `products` / `product_suppliers`. |
| C | `20261038_security_hardening.sql` | Fixes L1, L6, L8 and more. |
| C | `20261039_function_execute_hardening.sql` | **New file, not in the original list of 13.** Fixes L2–L5, L10. |

The app already tolerates being ahead of the database for 28–32 and 36, and uses permission-checked reads for 35 and 37 with
a fallback only until they are applied, so you can deploy the code before or after; the order of code and database does not
matter for correctness, but **do not run 35/37 and then leave the app on an old build** (it would `select *` and fail).

Never run the commented "OPTIONAL" scrub at the bottom of migration 38 without your explicit approval **and** a fresh backup of `audit_logs`. It is not needed today: no historic audit row holds a non-zero cost value (checked read-only, 28 Oct 2026).

---

## 3. Before you start (Free plan: no automatic backups)

1. Open Supabase → **Database → Backups** and note what it shows. On the Free plan expect "no backups".
2. Export the tables the sequence touches, so a mistake can be repaired. In the **Table Editor** use *Export → CSV* for:
   `products`, `product_suppliers`, `profiles`, `role_permissions`, `permissions`, `companies`, `orders`, `order_items`,
   `notifications`, `org_settings`, `tasks`. Keep the files private (they contain business data).
   Row counts to compare with each export (read from the live database on 28 Oct 2026): `products` 524, `product_suppliers` 524, `profiles` 16, `role_permissions` 28, `permissions` 12, `companies` 12, `orders` 2, `order_items` 2, `notifications` 2, `org_settings` 1, `tasks` 0, `audit_logs` 6,653. If an exported file has fewer rows (the Table Editor export may page), re-export before continuing. Also check you are in project `zrfetfibatcuvwogyvjn` (it is in the browser address bar).
3. Save the definitions about to be replaced. Run this once and download the result as CSV; it is the rollback source:

```sql
select 'function' as kind, p.proname as name, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public'
  and p.proname in ('advance_order_stage','client_respond_quotation','convert_quotation_to_order','handle_new_user','move_sample',
                    'track_order_status','write_audit','current_role','has_any_role','is_admin','assign_order',
                    'client_mark_quotation_viewed','record_campaign_event')
union all
select 'policy', tablename || '.' || policyname,
       'cmd=' || cmd || ' roles=' || roles::text || ' using=' || coalesce(qual,'') || ' check=' || coalesce(with_check,'')
from pg_policies
where schemaname = 'public'
  and tablename in ('campaigns','campaign_products','campaign_events','notifications','audit_logs')
union all
select 'view', 'client_products', pg_get_viewdef('public.client_products'::regclass)
union all
select 'constraint', conname, pg_get_constraintdef(oid) from pg_constraint
where conname in ('sample_movements_from_holder_check','sample_movements_to_holder_check','tasks_status_check');
```

4. Do it at a quiet time. Nothing here locks tables for long (the only table rewrite-free changes are column additions with
   constant defaults), but staff should not be saving costs while 35 and 37 run.
5. Tell Claude when you start, so it can check the database state between batches.

### If a file fails

1. **Stop.** Do not run the next file and do not click Run again.
2. Copy the full red error text (it names the line) and tell Claude which file it was.
3. Each file is a single script, so Postgres rolls back a failed script as a whole **only if the editor ran it as one transaction**. The editor may report partial success, so never assume: Claude will inspect the database read-only, object by object, to see exactly what the failed file left behind.
4. Claude will tell you the smallest corrective SQL (or a corrected file) and whether the file is safe to re-run. All files are idempotent (`if not exists`, `drop ... if exists`, `create or replace`), but a re-run is only done after that inspection.
5. If the app misbehaves during the session, do not roll back by reflex: rolling back restores the vulnerabilities in section 1. Send the symptom to Claude first.

### Rollback notes

| Migration | Reversible? | How |
|---|---|---|
| 26, 28–32, 36 | Yes, additive | `drop` the new objects (no data depends on them yet). Not needed in practice. |
| 27 | Yes | `drop trigger quotations_requirement_guard/sync`, `drop function ...`, `drop table requirement_events`, drop the columns. Only if no requirement has used the workflow. |
| 33, 34, 38, 39 (functions, policies, constraints) | Yes | Re-create from the section 3 CSV. **Rolling back restores the vulnerabilities in section 1.** |
| 35, 37 (column grants) | Yes | `grant select on public.orders, public.order_items, public.products, public.product_suppliers to authenticated;` and `grant select on public.products to anon;` — this re-exposes cost columns. |
| 34 `drop function move_sample` | Yes | Re-create the old `move_sample` (returns void) from the CSV. |

Data that the sequence changes: only the link text of existing in-app notifications (38 §6, 2 rows) and the role-permission
rows added by 26. Nothing is deleted. Product rows are never written.

---

## 4. Per-migration review

Legend: **Reviewed** = read in full, parsed offline with the PostgreSQL parser (`scripts/check-sql-syntax.py`, syntax only),
checked against the live schema. **Applied** = no (all). `Idempotent` = safe to run twice.

### 26 — module permissions and catalogues
- Adds 36 `module.*` permissions and 111 default role grants (`on conflict do nothing`), table `campaign_companies` (RLS on),
  makes `campaigns.company_id` nullable, copies existing single-company campaigns into `campaign_companies` (0 rows today),
  replaces 9 policies on `campaigns`, `campaign_products`, `campaign_events`, adds `company_product_interests.source_campaign_product_id` (+FK).
- Depends on: `client_products` view, `has_permission`, `can_management_read`, `company_product_interests` — all present live.
- Destructive: no. Idempotent: yes (drop policy if exists / on conflict / if not exists).
- Access effect: management can now read campaigns/products of campaigns (intended). Clients see only published catalogues assigned to their company.
- Residual: `campaign_events_select` lets `can_crm()/can_ops()` read all events (same as before).

### 27 — requirement workflow
- Adds workflow columns to `requirements`, 12-stage check, unique `(company_id, submission_key)`, unique one-draft-quotation-per-requirement,
  `requirement_products.unit_price_snapshot`, table `requirement_events` (RLS, no write policies), `requirement_transition()` and
  `requirement_add_internal_note()` (SECURITY DEFINER, `search_path=public`, execute revoked from public/anon), two quotation triggers.
- Depends on: `notify_users(notification_audience, uuid, text, text, text)` (present), `client_company_id()`.
- Destructive: no. Idempotent: yes. Business impact: staff-created requirements (no stage) are unaffected.

### 28 — allowed e-mail domains
- `companies.allowed_email_domains text[] not null default '{}'` + size check (≤ 20). Empty = no restriction. Idempotent.

### 29 — pricing batches
- `product_price_history.batch_id`, `rollback_of` + two partial indexes. RLS on that table already denies update/delete.

### 30 — staff notification e-mail
- `org_settings.staff_notification_email` + format check. No address seeded, so no staff e-mail is sent until you enter one in Settings.

### 31 — product sales channel
- `products.sales_channel text not null default 'both'` + check (`b2b|b2c|both`) + partial index; replaces view `client_products`
  with the **same 14 columns** as the live view (checked) and adds `sales_channel in ('b2b','both')`.
- Effect on the 524 products: none (all become `both`). Product rows are not rewritten (constant default).
- Order: before 37.

### 32 — site banners
- Table `site_banners` (RLS), 3 policies (public sees live banners only; staff see all; writes need `module.catalogues`).

### 33 — quotation item decisions
- `quotation_items.client_decision`, `client_decided_at`; `quotation_accepted_items`, `quotation_accepted_total`,
  `client_respond_quotation_items`; replaces `client_respond_quotation` and `convert_quotation_to_order` (same signatures, so the
  existing grants stay; 39 revokes `anon`). Adds quotation-expiry checks (India date).
- Known interim state: `quotation_accepted_items/_total` are definer functions until 38 (any signed-in user could read another company's quote lines). **Run 38 in the same sitting.** Quotations table has 0 rows today.
- Duplicate orders are impossible: `orders.quotation_id` is unique, `invoices.order_id` is unique, `orders.storefront_checkout_id` is unique (verified live).
- See L13 (62% cost fallback).

### 34 — order history, atomic sample movement
- Adds `order_status_history.assigned_to/department_id/stage_due_at`; replaces `track_order_status` and `advance_order_stage` (same 7-argument signature as live);
  widens the two holder checks to include `team`; drops and recreates `move_sample` (now returns the movement id; row-locked, one transaction);
  adds `receive_sample`. New functions revoke `public, anon`.
- Verified live: `sample_stock.with_team` exists; `sample_movements` has 0 rows; no object depends on `move_sample`.
- Gap (documented, not fixed): `sample_stock.with_team` has no `>= 0` check. The function enforces it, direct writes would not.

### 35 — order cost protection
- Withdraws table-wide SELECT on `orders` and `order_items` from `anon, authenticated`, grants SELECT on every column except
  `product_cost, printing_cost, courier_cost, other_cost, total_cost, gross_profit` (orders) and `supplier_cost_snapshot` (order_items).
  Readers: `order_cost_summary` (admin/accounts/management), `order_item_supplier_costs` (`suppliers.cost_view`).
- Checked live: no view and no SECURITY INVOKER function reads these columns; the two definer functions that do (`convert_quotation_to_order`, `recalc_order_cost`) run as owner and are unaffected.
- After it runs, `select *` on these tables fails for API users by design.

### 36 — rate limits
- Table `rate_limit_events` (RLS, no policies, all privileges revoked from API roles), `rate_limit_check()` (advisory-locked; execute only for `service_role`).

### 37 — product cost protection
- Same technique for `products` (`supplier_cost, internal_margin, internal_notes`; `anon` keeps the public columns) and `product_suppliers` (`supplier_cost`).
- Readers: `product_cost_summary` (admin/accounts/management), `product_supplier_costs` (`suppliers.cost_view`).
- Checked live: no dependent view or invoker function. Products/costs are currently empty, so no data is affected.

### 38 — security hardening
- Sections: `handle_new_user` (L1); requirement workflow guard trigger; accepted-items → SECURITY INVOKER; payments no-overpay trigger
  (needs `invoices.amount`: present); notification policies and `grant update (read_at)`; link repair; `tasks_status_check` incl. `blocked`;
  audit redaction (`audit_redact`, `write_audit`, `audit_select`, `audit_insert`).
- Behaviour change to know about: after this, a user created straight in the Supabase dashboard (or sign-up page) becomes `client_user`
  with no company. Staff and client users made through the app, the invite flows and `provision_client_user` get their real role set explicitly afterwards.
- Existing audit rows are not touched.

### 39 — function execute hardening (new)
- Re-creates `current_role`, `has_any_role`, `is_admin` (adds `is_active`), `assign_order` (NULL-role fix, `/crm` link),
  `client_mark_quotation_viewed` (`/crm` link), `record_campaign_event` (caller check), `recalc_order_cost` (only admin/accounts/management may call it; verified profit is stored only when product, printing, courier and other cost are all entered, the same rule as `src/lib/orders/costing.ts`; 0 otherwise). Revokes `anon`/public execute on 12 definer functions
  and limits `notify_users` to `service_role`. The RLS predicate helpers stay executable by `anon` on purpose (policies call them for anon requests).
- Trigger functions (`handle_new_user`, `write_audit`, …) stay executable: they cannot be called as RPC ("trigger functions can only be called as triggers").
- The Supabase advisor will still list the predicate helpers under lint 0028/0029; that is expected.

---

## 5. Verification queries (run after each batch; paste results to Claude)

### After batch A (26–32)

**Use the verified, paste-ready file `docs/verification/batch-a.sql` (read-only; it was run against the pre-migration database to prove it executes, and returned the expected "before" values).** The older block below is kept for reference only.

```sql
select count(*) as module_permissions from public.permissions where key like 'module.%';                          -- 36
select count(*) as module_role_grants from public.role_permissions where permission_key like 'module.%';           -- 111
select relrowsecurity from pg_class where oid = 'public.campaign_companies'::regclass;                              -- true
select is_nullable from information_schema.columns where table_schema='public' and table_name='campaigns' and column_name='company_id';  -- YES
select tablename, count(*) from pg_policies where schemaname='public' and tablename in ('campaign_companies','campaigns','campaign_products','campaign_events','requirement_events','site_banners') group by 1 order by 1;
   -- campaign_companies 2, campaign_events 2, campaign_products 3, campaigns 3, requirement_events 2, site_banners 3
select count(*) from pg_constraint where conname = 'requirements_workflow_stage_check';                             -- 1
select proname from pg_proc where proname in ('requirement_transition','requirement_add_internal_note','quotation_requirement_guard','quotation_requirement_sync') order by 1;  -- 4 rows
select tgname from pg_trigger where tgname in ('quotations_requirement_guard','quotations_requirement_sync','site_banners_updated_at') order by 1;  -- 3 rows
select column_name from information_schema.columns where table_schema='public' and
  ((table_name='companies' and column_name='allowed_email_domains') or (table_name='product_price_history' and column_name in ('batch_id','rollback_of'))
   or (table_name='org_settings' and column_name='staff_notification_email') or (table_name='products' and column_name='sales_channel')) order by 1;  -- 5 rows
select sales_channel, count(*) from public.products group by 1;                                                     -- both = 524
select count(*) from public.client_products;                                                                        -- 524 (unchanged)
```

### After batch B+C (33–39, one session)

**Use the verified, paste-ready file `docs/verification/batch-bc.sql` (read-only; executed against the pre-migration database to prove it runs, where every check showed its expected "before" difference, e.g. 22 cost-column privileges still open, 14 anon-executable functions outside the allowed list).** Run it once after file 39. The older blocks below are kept for reference.

### After batch B (33–37) — reference

```sql
select column_name from information_schema.columns where table_schema='public' and table_name='quotation_items' and column_name in ('client_decision','client_decided_at');  -- 2 rows
select proname, prorettype::regtype from pg_proc where proname in ('move_sample','receive_sample');                  -- both uuid
select pg_get_constraintdef(oid) from pg_constraint where conname = 'sample_movements_from_holder_check';           -- includes 'team'
select column_name from information_schema.columns where table_schema='public' and table_name='order_status_history' and column_name in ('assigned_to','department_id','stage_due_at');  -- 3 rows
select table_name, column_name from information_schema.column_privileges
 where table_schema='public' and grantee in ('anon','authenticated')
   and ((table_name='orders' and column_name in ('product_cost','printing_cost','courier_cost','other_cost','total_cost','gross_profit'))
     or (table_name='order_items' and column_name='supplier_cost_snapshot')
     or (table_name='products' and column_name in ('supplier_cost','internal_margin','internal_notes'))
     or (table_name='product_suppliers' and column_name='supplier_cost'));                                          -- 0 rows
select count(*) from information_schema.column_privileges where table_schema='public' and table_name='products' and grantee='anon' and column_name='price';  -- 1
select relrowsecurity from pg_class where oid = 'public.rate_limit_events'::regclass;                               -- true
select has_function_privilege('anon', 'public.rate_limit_check(text,text,integer,integer)', 'execute'),
       has_function_privilege('service_role', 'public.rate_limit_check(text,text,integer,integer)', 'execute');     -- false, true
select count(*) from public.products;                                                                               -- 524
```

### After batch C (38–39) — and the product integrity re-check

```sql
select tgname from pg_trigger where tgname in ('requirements_workflow_guard','payments_no_overpay') order by 1;     -- 2 rows
select proname, prosecdef from pg_proc where proname in ('quotation_accepted_items','quotation_accepted_total');   -- both false
select public.audit_redact('products', '{"name":"x","supplier_cost":5}'::jsonb);                                    -- no supplier_cost, restricted_fields_changed present
select policyname from pg_policies where tablename='audit_logs' order by 1;                                         -- audit_insert, audit_select
select column_name from information_schema.column_privileges where table_schema='public' and table_name='notifications' and grantee='authenticated' and privilege_type='UPDATE';  -- read_at only
select pg_get_constraintdef(oid) from pg_constraint where conname = 'tasks_status_check';                           -- includes 'blocked'
select prosrc like '%raw_app_meta_data%' and prosrc not like '%raw_user_meta_data->>''role''%' as signup_hardened from pg_proc where proname='handle_new_user';  -- true
select proname from pg_proc p join pg_namespace s on s.oid = p.pronamespace
 where s.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
   and proname not in ('is_internal','is_client','is_admin','current_role','has_any_role','has_permission','client_company_id',
                       'can_crm','can_ops','can_finance','can_sales','can_management_read','can_orders_read','can_orders_write',
                       'can_manage_team','can_client_admin','handle_new_user','write_audit','track_order_status','prevent_lead_regression',
                       'protect_catalogue_access','write_catalogue_access_audit','payments_refresh_invoice','payments_no_overpay',
                       'quotation_requirement_guard','quotation_requirement_sync');                                  -- 0 rows
select has_function_privilege('authenticated','public.notify_users(public.notification_audience, uuid, text, text, text)','execute'),
       has_function_privilege('service_role','public.notify_users(public.notification_audience, uuid, text, text, text)','execute');  -- false, true
select count(*) as products, count(*) filter (where status::text='active') as active, count(*) filter (where sku like 'HGS-%') as hgs,
       count(distinct sku) as skus,
       md5(string_agg(id::text||'|'||coalesce(name,'')||'|'||coalesce(sku,'')||'|'||coalesce(price::text,'')||'|'||coalesce(image_url,'')||'|'||coalesce(supplier_id::text,''), ',' order by id)) as fingerprint
from public.products;
   -- 524 | 524 | 474 | 524 | 60e683d350cd7e55a474b2b86ec87aab   (must be identical to the pre-migration baseline)
```

If any result differs from the expected value: **stop, do not run the next file**, and send Claude the output.

---

## 6. What Claude verifies after you confirm (not yet done)

Phase 4/5 of the plan: role and cross-company isolation through the real API with test accounts, anon-key attempts at every restricted
column and function, sample-stock atomicity and concurrency, overpayment concurrency, the full requirement → quotation → order flow,
B2C checkout in demo mode, notifications ledger, cron endpoints. All test records will be clearly named and only those exact
records will be cleaned up, and only after you authorise writes (production is the only database).

## 7. Things the migrations do not do

- They do not turn on leaked-password protection or change Auth settings (Supabase dashboard; leaked-password protection needs a paid plan).
- They do not change PayU (stays in demo mode) or WhatsApp (stays outbox only).
- They do not touch the 524 products. Migration 31 adds one column with a default; migrations 35/37 only change who can read which column.

## 8. Decisions still needed from you (not guessed)

1. Which internal roles may see product/order costs and margins. Secure default kept: admin, accounts, management; supplier-mapping costs need `suppliers.cost_view` (admin, accounts, management, operations today).
2. Whether company auto-linking by e-mail domain should be switched on (the column exists, empty = no restriction).
3. ~~`convert_quotation_to_order` 62% cost assumption (L13)~~ **Decided (option B)**: unknown cost stays "costs not entered" (0); never invented. Implemented in migration 33.
4. Delivery charge is `0.00` and the free-delivery threshold is empty; the client must supply real values before launch.
5. Whether to also tighten the default `TRUNCATE/REFERENCES/TRIGGER` privileges (L11) in a later migration.
