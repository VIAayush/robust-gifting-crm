# Self-audit test report

Date: 27 October 2026. Scope: the Robust Gifting CRM against `Robust Gifting CRM - Scope of Work-final.pdf`.
Local URL: http://localhost:3000. **Update, 28 October 2026:** migrations 20261026 to 20261039 have since been applied and verified against Supabase project `zrfetfibatcuvwogyvjn` (see "Real-database results" below). The first part of this report (27 October) was written before the database was available and is kept as written; where it says "not contacted" or "not applied" it is superseded by the update. Nothing is committed, pushed or deployed; no existing business row was changed (the 524 products fingerprint is identical before and after).

## How to read the evidence

| Kind | Meaning | Proves |
|---|---|---|
| Static | Code or SQL read, or a scripted scan of the source | The code and `schema.sql` agree; says nothing about the live database |
| Unit | Pure function test, no I/O | The rule itself |
| Action (fake DB) | A real server action called directly against an in-memory fake database (`scripts/stubs/`) | Application-layer authorisation, validation and sequencing. **Not** RLS, column privileges, triggers, constraints or joins |
| SQL syntax | `pglast` parse of every migration from 20261026 (`scripts/check-sql-syntax.py`) | The SQL parses. **Not** that it behaves correctly |
| Browser | Real browser pane at 375px against the local dev server | Rendering, no horizontal overflow, console errors |
| Real DB / real provider | Needs Supabase, PayU, Resend or WhatsApp | **Not performed.** Listed under BLOCKED |

Statuses: PASS, FAIL, BLOCKED (needs Supabase, credentials or client data), NOT VERIFIED (code exists, behaviour not exercised), NOT APPLICABLE.

## Commands run (final state)

| Command | Result |
|---|---|
| `npm test` (runs every `scripts/test-*.mts`, requires exit 0 and an "assertions passed" line, then the SQL syntax check) | **28 Oct 2026 final run: 38 test files, 38 passed, 0 failed**; migration syntax PASS (all 14 migrations, 26 to 39, parse). These are unit and fake-database action tests. The separate real-database tests (223 checks, saved in `scripts/db-tests/`) were run directly against the live database and are listed in the sections "Real-database results" and "Follow-up session" below; they are not part of `npm test`. No browser-authenticated or external-provider test has run |
| `npx tsc --noEmit` | 0 errors (28 Oct, after fixing a typing error in the new test file that had broken the build) |
| `npx eslint .` | 81 problems (60 errors, 21 warnings) = the original baseline of 81. None are in files added by this audit; the touched-file findings are pre-existing (dashboard `react-hooks` rules, unused icons in `invoices/[id]`, `checkout/page.tsx`) |
| `npm run build` | Compiled successfully, 90/90 pages (28 Oct, exit code 0). Note: the first 28 Oct build **failed** on a TypeScript error in `scripts/test-actions-deactivated.mts` (Next type-checks `scripts/`); fixed and re-run |
| Browser, 375px: `/`, `/cart`, `/request-quote`, `/track-order`, `/login`, `/signup` | No horizontal overflow (scrollWidth 375). Only console errors were the dev HMR websocket. `/products` redirects to login (requires sign-in) |

Authenticated CRM and portal pages could not be browsed (no database, no sign-in), so no browser result exists for them.

## Test inventory

The 21 pre-existing test files were re-run and read: each executes (exit 0 plus assertion line), asserts failure cases (tampered hashes, bad input, blocked states) rather than only happy paths, and uses no network or production data. Twelve new files were added (ten in the first pass, `test-audit-redaction.mts` and `test-actions-procurement.mts` in the follow-up).

| Feature / scope reference | Test scenario | Expected | Actual | Status | Evidence | Defect or next step |
|---|---|---|---|---|---|---|
| 3.10 PayU hashes, tamper rejection, demo fallback | request hash, response hash, wrong hash, no credentials | tamper refused; demo when unconfigured | as expected | PASS (unit) | `test-payu-provider.mts` | Live PayU BLOCKED |
| 3.10 PayU verify interpretation | success + right amount; wrong amount; no amount; failure/cancelled; pending/initiated/unknown | only success + matching amount is paid; pending is never failed | as expected | PASS (unit) | `test-actions-checkout.mts` | Fixed D1 below |
| 3.2 Demo payment forgery | mismatched checkout/payment ids; malformed ids; PayU active; failure after another paid attempt | refused; payment stays pending; paid checkout not failed | as expected | PASS (action, fake DB) | `test-actions-checkout.mts` | Fixed D2, D3 |
| 3.2 Payment reconciliation | stuck payments, repaired orders, lost claim, notify after repair | one order, no guess, repaired order notifies | as expected | PASS (unit) | `test-payment-reconcile.mts` | Candidate query split (static); needs DB run |
| 3.9 Finance actions | record payment, invoice from order, payables as each role | only finance; no overpayment; DB status values | as expected | PASS (action, fake DB) | `test-actions-finance.mts` | RLS BLOCKED |
| 3.5 Requirement editor | client, inactive user, anonymous, staff; status and budget on workflow requirements | staff only; allow-list; workflow status follows workflow; scope frozen after approval | as expected | PASS (action, fake DB) | `test-actions-requirements.mts` | DB guard trigger BLOCKED |
| 3.5 Requirement workflow rules | stage helpers, budget maths | per RG-23..29 | as expected | PASS (unit) | `test-requirement-workflow.mts` | SQL transition function BLOCKED |
| 3.5 Quotation status and client response | role checks, draft with no items, jumps, viewed to expired, concurrent client answer, expired validity, item decisions | refused or kept, never overwritten | as expected | PASS (action, fake DB) | `test-actions-quotations.mts` | DB functions BLOCKED |
| 3.5 Item-level decisions | validation of decisions | every line exactly once | as expected | PASS (unit) | `test-quotation-decisions.mts`, `test-quotation-lines.mts` | |
| 3.8 Sample requests | shipped/rejected requests, wrong roles, double click, failed movement | stock moves once; request reopens on failure | as expected | PASS (action, fake DB) | `test-actions-samples.mts` | Atomic `move_sample` BLOCKED |
| 3.4 Product cost writes | sales hand-built cost post, admin edit, negative cost, SKU change | only roles that see costs write them | as expected | PASS (action, fake DB) | `test-actions-products.mts` | Column privileges (migration 37) BLOCKED |
| 3.10 Email ledger and dedupe | duplicate event, failed send, thrown error, retry budget, new round, ledger error | one email per recipient; failed retried; sent never repeated; never marked sent unless provider accepted | as expected | PASS (action, stubbed provider) | `test-notifications-ledger.mts` | Real Resend/WhatsApp BLOCKED |
| 7 Rate limits on public actions | 6th quote, 11th order/checkout, 4th mailbox reset, spoofed forwarded header | refused with the standard message; keyed on `x-real-ip` | as expected | PASS (in-memory limiter) | `test-public-rate-limits.mts` | Shared DB limiter (migration 36) BLOCKED |
| 6 / 3.4 Audit log carries no costs | cost and margin keys in orders, products, order lines, supplier mappings; writeAudit; summaries; SQL list vs TypeScript list; policies | no figure stored or printed; lists identical; own-row read excludes cost entities | as expected | PASS (unit, action; static for SQL) | `test-audit-redaction.mts` | Trigger and policies BLOCKED |
| 3.7 Order-line supplier and procurement | wrong order, blocked/unknown supplier, no supplier, role, audit before/after without cost | refused; trail correct; cost never audited | as expected | PASS (action, fake DB) | `test-actions-procurement.mts` | |
| 3.7 Vendor actions | suppliers through partner actions; raw DB errors | suppliers refused; friendly messages | as expected | PASS (action, fake DB) | `test-actions-procurement.mts` | |
| 3.5 Quotation from requirement | every workflow stage, client role, migration 27 absent | approved stages only; staff only; fails closed with a clear message | as expected | PASS (action, fake DB) | `test-actions-requirements.mts` | |
| 3.10 Product-available email | provider failure then recovery, repeat, different product set | retried, never repeated, set-specific | as expected | PASS (action, stubbed provider) | `test-notifications-ledger.mts` | Real delivery BLOCKED |
| Security helpers | `%` and `_` in typed emails; delivery threshold 0/blank/negative; cron bearer comparison | matched literally; zero is "no threshold" | as expected | PASS (unit) | `test-security-helpers.mts` | |
| Status literals vs enums | every `status` filter on invoices, quotations, orders, requirements, activities, payables, tasks | exists in the enum/check | 12 literals checked, all valid; a deliberate bad literal is caught (mutation check) | PASS (static) | `test-status-literals.mts` | |
| Migrations 26 to 38 | parse every statement and PL/pgSQL body | parses | all parse | PASS (SQL syntax) | `check-sql-syntax.py` | Behaviour BLOCKED |
| Roles and module access, templates | role templates and module matrix | per SOW section 4 | as expected | PASS (unit) | `test-role-templates.mts` | RLS BLOCKED |
| Catalogue, channel, trending, banners, upload rules, tracking, vendor report, price rollback, recently viewed, rate-limit/customisation | existing rule tests | as designed | as expected | PASS (unit) | the remaining existing files | |
| RLS isolation between companies, supplier-cost protection through the data API, anon-key access | not runnable | | | BLOCKED | | See "Database-dependent checks" |
| Real PayU / Resend / WhatsApp | not runnable | | | BLOCKED | | credentials not supplied |

## Defects found and fixed in this audit

| # | Defect | Severity | Fix | Regression test |
|---|---|---|---|---|
| D1 | PayU verify treated any status other than "success" as failed, so a payment that settles later (UPI collect) was failed; success with a missing amount was accepted | High | `interpretVerifyDetail`: pending/unknown stays unresolved; unreadable amount is ambiguous; JSON parse guarded; `additionalCharges` included in the reverse hash | `test-actions-checkout.mts` |
| D2 | Demo payment completion did not check the payment belonged to the checkout, nor that the demo provider was active | High | UUID validation, provider check, `checkout_id` match | `test-actions-checkout.mts` |
| D3 | A failed attempt marked the whole checkout failed even if another attempt had paid | High | `markCheckoutFailedIfUnpaid` used by demo action, PayU callback and reconcile | `test-actions-checkout.mts` |
| D4 | PayU callback could overwrite a paid/failed payment with "processing" | Medium | conditional update on pending/processing | static (callback is an HTTP route) |
| D5 | `updateRequirement` was an exported server action taking any column from the browser | High | internal helper; staff only; field allow-list; status/budget/quantity rules for workflow requirements | `test-actions-requirements.mts` |
| D6 | Checkout customer lookup used the typed email as an ILIKE pattern (wildcards matched other people), reused any contact, overwrote names | High | literal match, individual-customer contacts only, never overwrites a name | `test-security-helpers.mts` (matching rule); `createOrderFromCheckout` itself BLOCKED |
| D7 | Company-name and email lookups elsewhere had the same wildcard problem | Medium | `exactIlike` in quote, cart, team, portal | `test-security-helpers.mts` |
| D8 | Activities were created with an invalid status | Medium | `upcoming`, allow-lists | static |
| D9 | Invoice filter offered "draft/sent", receivables queried "issued", dashboard queried activity status "done", payables compared "partially_paid": each makes a query fail or never match | Medium | corrected to the real enum values | `test-status-literals.mts` |
| D10 | Task status "Blocked" is offered but the database check refused it | Medium | migration 38 widens the check | `test-status-literals.mts` (migration asserted) |
| D11 | Email ledger: a failed email was never retried; a thrown network error left a row "in progress"; requirement emails to clients bypassed the ledger (a repeat sent duplicates) | High | retry of failed rows (bounded to 5, claimed conditionally), try/catch, per-user emails through the ledger | `test-notifications-ledger.mts` |
| D12 | Order-status notifications could never repeat for a status reached again | Low | keyed on the order's `updated_at` | `test-notifications-ledger.mts` |
| D13 | No rate limit on cart quote, cart order, checkout creation, sign-up, password reset, sign-in; first forwarded hop trusted | High | new buckets, per-mailbox limit, `x-real-ip` preferred | `test-public-rate-limits.mts` |
| D14 | Free-delivery threshold 0 made every order free; settings read failure silently meant free delivery | Medium | shared `delivery.ts`; checkout refuses if settings cannot be read | `test-security-helpers.mts` |
| D15 | Quotation status update was not conditional (a client's answer could be overwritten); a "viewed" quotation could not be expired; an empty quotation could be sent | Medium | conditional update, transitions, item-count check | `test-actions-quotations.mts` |
| D16 | An expired quotation could still be accepted | Medium | app check plus a check in the item and whole-quotation functions (migration 33) | `test-actions-quotations.mts` (app); SQL BLOCKED |
| D17 | A sample request could be fulfilled repeatedly (stock moved each time) or after rejection | High | claim before moving, restore on failure, status guards | `test-actions-samples.mts` |
| D18 | Product cost and margin could be written by any catalogue editor with a hand-built request | Medium | accepted only from roles that can see costs | `test-actions-products.mts` |
| D19 | Reconciliation candidate query could be crowded out by old paid orders; a repaired order sent no notification | Medium | two queries; notify after repair | `test-payment-reconcile.mts` |
| D20 | Notification links `/orders/<id>` and `/quotations/<id>` pointed at pages that do not exist | Low | corrected in migration 33; existing rows repaired in migration 38 | static |
| D21 | `handle_new_user` trusted `role` and `company_id` from sign-up metadata; the public sign-up fallback lets a visitor ask Supabase Auth for `admin` | **Critical** | migration 38: default `client_user`, only `raw_app_meta_data` (admin API only) may set role/company; every in-app flow already sets role and company explicitly afterwards | SQL BLOCKED |
| D22 | Staff could change a requirement's workflow stage by writing the column directly | High | migration 38 guard trigger (direct API writes refused; the definer functions pass) | SQL BLOCKED |
| D23 | `quotation_accepted_items/_total` were definer functions callable by any signed-in user for any quotation | High | migration 38: invoker rights | SQL BLOCKED |
| D24 | Nothing at the database stopped payments exceeding an invoice | Medium | migration 38 trigger with row lock | SQL BLOCKED |
| D25 | Clients could insert notifications and change any column of their own | Medium | migration 38 policies and column privilege (`read_at` only) | SQL BLOCKED |
| D26 | `audit_logs` stored the whole row for orders and products, so product cost, printing/courier/other cost, total cost, gross profit, supplier cost and margin were copied there; a user could read audit rows for changes they made (including sales and operations), and summaries printed the figures | High | `writeAudit` and the summary code drop cost fields (names only recorded); migration 38 redacts in `write_audit()`, excludes cost-bearing entities from the "own rows" read, and restricts audit inserts to internal users acting as themselves. Existing rows are not rewritten (an optional scrub statement is in the migration, to run by hand after a backup) | `test-audit-redaction.mts` (code and drift); SQL BLOCKED |
| D27 | Product-available emails were sent once with no retry and keyed on a truncated id list (two large product sets could look the same) | Medium | ledgered per user, bounded retry, never repeated; key is a hash of the whole set | `test-notifications-ledger.mts` |
| D28 | Quotation-from-requirement had no role check and failed with "Requirement not found" when migration 27 was missing | Medium | admin/sales only; a clear fail-closed message naming the migration, no quotation number consumed | `test-actions-requirements.mts` |
| D29 | Partner actions accepted `suppliers`, letting admin/operations/management create, edit or remove suppliers without the `suppliers.*` permissions or the blocked status; raw database messages shown | High | suppliers refused there; friendly vendor messages | `test-actions-procurement.mts` |
| D30 | Order-line supplier assignment and procurement did not check the line belonged to the order, accepted inactive or unknown suppliers, allowed "PO raised" with no supplier, and audited the supplier cost | Medium | ownership check, active-supplier check, supplier needed to progress, before/after in the audit, no cost | `test-actions-procurement.mts` |
| D31 | Cron routes compared the bearer secret with `!==` | Low | constant-time comparison | `test-security-helpers.mts` |

## Remaining defects and gaps (not fixed locally)

Status of the seven items listed before the follow-up:

| # | Item | Outcome |
|---|---|---|
| R1 | Order-line audit trail, supplier/partner messages | **Resolved** (D29, D30) |
| R2 | Quotation from requirement without migration 27 | **Resolved**: fails closed with a clear message (D28). It does not fall back, because without the workflow columns nothing records whether the client approved, so any fallback would bypass the approval gate |
| R3 | Product-available emails not retried | **Resolved** (D27) |
| R4 | Cost values inside audit-log rows (and catalogue multi-company gaps) | **Cost exposure resolved in code and in migration 38** (D26). Rows already in `audit_logs` stay until the optional scrub is run; they are readable only by admin and management. The migration-26 catalogue gap is unchanged and needs live data to assess |
| R5 | Rate limits per connection | **Reviewed, documented** (below); cron secret comparison hardened (D31) |
| R6 | Lint baseline of 81 | **Inspected, no genuine defect found** (below); nothing changed |
| R7 | SQL parser quirk | **Investigated and explained** (below); the checker now handles it by rule instead of by function name |

### R5. Rate-limit review and limitations

Reviewed: the database function (`rate_limit_check`, migration 36) is sound: advisory lock per key so concurrent calls cannot both pass, blocked attempts are not counted, only a hashed key is stored, the table has RLS with no policies, and execution is granted to the service role only. The application limiter falls back to an in-memory window when the function is missing or errors. Unauthenticated routes: the two cron routes need `CRON_SECRET` (now compared in constant time); the PayU callback changes nothing without a valid hash.

Limitations that remain, by design:
1. **Per connection address.** Offices behind one address share an allowance (sign-in 30, enquiry 5, order 10, sign-up/reset 8 per 10 minutes).
2. **Trusts `x-real-ip`.** That is correct behind Vercel, which sets it from the real connection. On any host that does not overwrite it, a caller could vary it to get fresh allowances. Check this after deployment.
3. **Per-mailbox limit can be used against a person.** Three reset or confirmation mails per hour per address stops mail flooding but also lets an attacker use up a victim's allowance for an hour (they can retry later; sign-in is unaffected).
4. **Falls open to memory.** If the database call fails, the per-instance window applies (each serverless instance counts separately), so the limit is weaker during an outage rather than blocking real users.
5. **No limit on the PayU callback**, deliberately: PayU's traffic comes from a few addresses and dropping a genuine callback is worse than a cheap database lookup. Authenticity rests on the hash and the Verify Payment call.
6. **Signed-in actions are not rate limited**; they rely on authentication and roles.

### R6. Lint baseline inspected (81 problems, unchanged)

| Rule | Count | Where | Assessment |
|---|---|---|---|
| `no-explicit-any` | 25 | cookie-option typing in auth routes, `supabase/server.ts`, `proxy.ts`; Supabase join shapes on CRM pages | Typing only. The auth confirm route was read in full: the redirect target is a fixed path on the request's own origin and the OTP type defaults safely, so no open redirect or token handling defect |
| `no-unused-vars` | 20 | icons and imports | Cosmetic |
| `react-hooks/static-components` | 17 | components declared inside server pages (dashboard, my-work, search) | Server-rendered and stateless: no runtime effect. Would matter only if these pages became client components |
| `react-hooks/set-state-in-effect` | 11 | browser components (cart, wishlist, avatar, image, filters) | Standard mount-time hydration pattern; at most an extra render |
| `prefer-const` | 5 | query builders | Style |
| `react-hooks/purity` | 1 | `Date.now()` in the dashboard server page | False positive on a server component |
| other | 2 | one `<a>` for an internal path, one unused expression | Cosmetic |

None affects security, data handling or the Scope of Work, and none was introduced by this audit. They are left alone on purpose to avoid unrelated changes.

### R7. The SQL parser quirk, and how migrations are validated safely

Cause (reproduced with minimal functions): the offline parser has no database catalogue. A PL/pgSQL variable of a user-defined type (an enum such as `order_status`) used as one of several targets in `SELECT ... INTO a, b, c` is mistaken for a record, giving "record variable cannot be part of multiple-item INTO list". PostgreSQL knows the type is a scalar, so the real function is valid, which is why the same statement already runs in the live database. `advance_order_stage` is the only function affected.

Handling: `scripts/check-sql-syntax.py` now re-parses a function that fails with exactly that message after swapping each declared non-built-in variable type for `text`; only if that passes is the function accepted (with a printed note). Any other error, including a genuine record misuse, still fails (checked with two deliberately broken files). This proves syntax only.

Safe validation once a database exists: do not run the migrations on production first. Apply 26 to 38 in order on a scratch target, either a Supabase branch of the project or a local PostgreSQL loaded from `supabase/schema.sql` (none is installed on this machine and I did not install one), run the verification queries at the bottom of each file, run the app's tests against it, and only then repeat on production in a quiet period with a backup taken first.

### Still open

| # | Item | Why |
|---|---|---|
| R8 | Documents catalogue multi-company gap (migration 26) | Needs live data to judge exposure |
| R9 | Historic audit rows may already contain cost figures | Needs the optional scrub, a deliberate decision and a backup |
| R10 | Lint baseline (81) | Pre-existing, no defect found |
| R11 | `x-real-ip` trust and per-address limits | Deployment-dependent, see R5 |

## Real-database results after applying migrations 26 to 39 (28 October 2026)

Full log, backup details and test breakdown: `docs/DATABASE_MIGRATION_RUNBOOK.md` section 0. Summary:

| Check | Status | Evidence |
|---|---|---|
| Migrations 26 to 39 applied | **PASS** | applied in file order; 39 failed once (42P13, parameter defaults) and rolled back completely, was corrected and applied; `batch-a.sql` 24/24 and query 2, `batch-bc.sql` 36/36 and query 2 |
| Function bodies equal the repository files | **PASS** | md5 of all 30 created/replaced functions identical to the files |
| Pre-migration backup | **PASS (in-database snapshot) / FAIL (file export)** | Free plan, no automatic backups; the data API returned HTTP 402 so CSV/JSON export was impossible; verified snapshot of the 11 tables + 72 definitions in private schema `backup_20261028` (hashes equal). File export script ready for when the API returns |
| 524 products unchanged | **PASS** | fingerprint `60e683d350cd7e55a474b2b86ec87aab` before and after; 524 active, 474 `HGS-`, 524 SKUs, 524 images, `client_products` 524, `sales_channel` both=524 |
| L1 sign-up cannot assign roles from metadata | **PASS (real DB)** | `role=admin`+company in user metadata → `client_user`/no company; invalid role → `client_user`; admin-API `app_metadata` role still honoured |
| L2/L3/L4 anonymous and unauthorised function calls | **PASS (real DB)** | 18 privileged functions refused to `anon` (42501); `notify_users` refused to every non-service role; profile-less signed-in user refused by `assign_order` (the NULL-role bypass is closed) |
| L5 deactivated staff | **PASS (real DB)** | deactivated admin: `is_admin()` false, `current_role()` NULL, privileged functions refused, org settings and role permissions unchanged |
| Cost protection (columns, functions, audit) | **PASS (real DB)** | 6 order + 3 product + 2 supplier cost columns unreadable by anon, clients, sales, operations and even admin directly; checked functions return them only to the permitted roles; new audit rows hold only column names, never values |
| Cross-company isolation | **PASS (real DB)** | company B sees none of company A's requirements, events, selections, quotations, quotation lines (including through `quotation_accepted_items()`), orders or notifications |
| Requirement workflow guards | **PASS (real DB)** | direct stage/company writes refused for admin and sales; client cannot update; invalid transitions refused; budget frozen after approval |
| Quotation expiry and item decisions | **PASS (real DB)** | expired quotation refused whole and per item; partial acceptance → accepted total 236.00; second answer refused; foreign/incomplete decisions refused |
| Option B costing | **PASS (real DB)** | all costed → 230; any line with cost NULL/0 → order cost 0; profit stored 0; profit stored only after all four components (552.00) |
| Overpayment, duplicates | **PASS (real DB, sequential)** / **NOT VERIFIED (concurrent)** | overpay, zero, negative, edit-past-total refused; exact settle → paid; second invoice per order and second order per quotation refused. Two simultaneous sessions could not be run with the tools available |
| Eight fulfilment stages | **PASS (real DB)** | one history row per change with assignee/department/due date, tasks, per-stage client notifications, `/crm` and `/portal` links |
| Sample stock | **PASS (real DB, sequential)** / **NOT VERIFIED (concurrent)** | atomic (failed ledger row rolled the stock back), `team` location works, no negatives. Concurrent moves not run |
| Rate limiter | **PASS (real DB)** | 3rd call refused; keys/buckets independent; signed-in users cannot read counters; service role may call. Persistence across a server restart is by design (it is a table); not separately restarted |
| Notification dedupe | **PASS (schema)** / **NOT VERIFIED (application ledger)** | unique index on `notification_outbox.dedupe_key` exists; the application's email ledger retry/dedupe was tested only with the fake database |
| **Data API / site availability** | **FAIL (blocker)** | **Supabase returns HTTP 402 `exceed_egress_quota` for REST, Auth and Storage (Free plan). The B2C store, client portal and CRM cannot reach the database for anyone until the plan is upgraded or the quota resets** |
| Next.js application against the live database (login, portal, CRM pages, server actions, B2C checkout, PayU demo, reconciliation endpoints, e-mail) | **BLOCKED** | needs the data API (402); not run |
| Real PayU / Resend / WhatsApp | **BLOCKED** | no credentials / approvals |

Defects found while doing this, with fixes: **migration 39 parameter defaults (42P13)**, fixed in the file and pinned by `scripts/test-migration-signatures.mts`; a few mistakes in my own test scripts (listed in the runbook) were corrected and did not affect the database. Informational: order stages are free-form (operations/admin can move an order backwards); recorded, not changed.

## Follow-up session: API recheck, saved database tests, outage behaviour (28 October 2026)

| Item | Status | Evidence |
|---|---|---|
| Supabase data API (REST, Auth, Storage) | **FAIL (still blocked)** | rechecked at the start and again at the end: HTTP 402 `exceed_egress_quota` on all three, even anonymously. Not bypassed |
| External backup export (`export_backup.mjs`) | **BLOCKED** | needs the data API. The verified in-database snapshot `backup_20261028` is retained; it was **not** compared to an external export because none could be made. Do not drop it |
| Real-database test scripts saved and rerun | **PASS** | `scripts/db-tests/01-security.sql` **89/89**, `02-requirements-quotations-samples.sql` **83/83**, `03-orders-costing-finance.sql` **51/51**: **223 of 223**, `failed: []` each; nothing persisted (re-verified: no leftover rows, 524-product fingerprint identical). Harness defects fixed along the way (column-name clash in the summary, volatile function in a `WHERE`, NULL results silently ignored, two wrong expectations); no database defect was found by the corrected suite |
| Next.js app against the live database (login, staff roles, company isolation, B2B/B2C flows, finance, tracking) | **BLOCKED** | login and every data read need Auth/REST (402). The same rules were verified at the database layer above, which is **not** a substitute for testing the screens |
| App behaviour while the API is down (browser, localhost) | **PASS with one defect fixed** | `/login`, `/home` render; `/portal/*` and `/crm/*` redirect to `/login`; nothing crashes. **Defect D36 found and fixed**: the cached public catalogue loaders returned `[]` / `null` on a query error and `unstable_cache` kept that for 60 s, so an outage left the shop empty (and product pages "not found") for up to a minute after recovery. Loaders now throw on a query error (not cached) and a wrapper returns the same empty fallback for that request only. Regression test `scripts/test-catalogue-cache.mts` (fails on the old code at "the list recovers immediately", verified) |
| Still misleading while the API is down | **NOT FIXED (cosmetic)** | `/catalogue` shows "0 products / No gifts match these filters" instead of "temporarily unavailable". Safe (nothing breaks, nothing leaks) but confusing to a visitor; a distinct outage message would need page changes beyond the agreed scope |
| `npm test` / `tsc` / SQL syntax / build / lint | **PASS / PASS / PASS / PASS / baseline** | 38 of 38 test files; `tsc` 0 errors; all 14 migrations parse; build 90/90 pages exit 0; eslint 81 problems = baseline, none new |
| Responsive (375px), form validation on authenticated pages, access-denied screens, payment failure/retry, reconciliation endpoints, Option B on order page and dashboard screens | **BLOCKED** | need sign-in / data (API 402). Option B is verified in the database (converter and `recalc_order_cost`) and in unit tests; the screens are not |

## Earlier read-only inspection (28 October 2026, before applying; superseded by the section above)

The database was reachable again. Only `select` queries and the Supabase security advisor were used; nothing was written, no migration was applied, and no test account or record was created. Full detail and the apply procedure are in `docs/DATABASE_MIGRATION_RUNBOOK.md`.

| Check | Result |
|---|---|
| Migrations 20261026 to 20261038 applied | **No** (every object they create is absent; re-checked at the start of the next session, still unapplied) |
| Isolated target for a dry run | **None** (no Supabase branch; Free plan, no automatic backups) |
| 524 products | **PASS (read-only)**: 524 total / 524 active / 474 `HGS-` / 524 distinct SKUs / 524 with image; fingerprint `60e683d350cd7e55a474b2b86ec87aab` recorded as the baseline to compare after migrating |
| Migration dependencies vs live schema | **PASS**: every table, column, function, enum and policy the 14 files rely on exists with the expected shape (`client_products` column list identical, `advance_order_stage` signature identical, `invoices.amount`, `sample_stock.with_team`, unique indexes on `orders.quotation_id`, `invoices.order_id`, `orders.storefront_checkout_id`) |
| Cost values currently stored | None: 0 products with supplier cost, margin or notes; 0 audit rows holding a non-zero cost value. The exposure was structural; the optional audit scrub is not needed today |

New defects found in the live database (static evidence from the function source and ACLs; **not exploited**):

| ID | Severity | Defect | Status |
|---|---|---|---|
| L1 | Critical | `handle_new_user` trusts `raw_user_meta_data.role` and defaults to `sales` (this is D21, now confirmed on the live function) | Fixed in migration 38; **open until applied** |
| L2 | High | `notify_users` is executable by `anon` with no caller check | Fixed in new migration 39; open until applied |
| L3 | High | `assign_order` role test is NULL for a caller without a profile, so it never raises; executable by `anon`; app never calls it | Fixed in migration 39; open until applied |
| L4 | Medium | `record_campaign_event`, `recalc_order_cost`, `recalc_quotation_totals`, `refresh_invoice_status` unprotected for `anon` (37 anon-executable definer functions in total, matches advisor lint 0028) | Fixed in migration 39; open until applied |
| L5 | Medium | `has_any_role`, `is_admin`, `current_role` ignore `profiles.is_active`: a deactivated staff user keeps database privileges | Fixed in migration 39; open until applied |
| L10 | Low | `client_mark_quotation_viewed` and `assign_order` still write links to non-existent `/quotations/..`, `/orders/..` | Fixed in migration 39 (existing rows by 38 §6) |
| L13 | Business decision | `convert_quotation_to_order` assumes cost = 62% of price when a product has no `supplier_cost` | **Decided (option B, 28 Oct): unknown cost stays "costs not entered", never invented.** Implemented in migration 33; open until applied |

### Defects found and fixed in the 28 October code review (application code, in the working tree, not committed)

| ID | Severity | Defect | Fix | Regression test | Status |
|---|---|---|---|---|---|
| D32 | Medium | Dashboard "Gross margin" summed stored `gross_profit` over all orders. Orders with no costs, or only printing/courier/other cost, contributed up to their whole value as "margin". | `src/lib/orders/costing.ts`: four states. A stored 0 cannot be told from "not entered" (stated on screen), so **verified** profit needs product, printing, courier and other cost all > 0; product cost > 0 with a zero component is **provisional** (amber, labelled, never summed); costs without a product cost are **incomplete** (nothing shown); none is **not entered**. Product-cost completeness and whole-order completeness are separate flags. Dashboard card "Gross margin (fully costed orders)" sums verified orders only and lists provisional / not-costed counts. Stored `gross_profit` = verified profit only (0 otherwise), by `recalc_order_cost` (migration 39); conversion stores 0 | `scripts/test-order-costing.mts` (all lines costed, one missing, NULL/zero/negative, quantity, partial entry after creation, legitimately zero components, fully costed, loss-making, dashboard aggregation incl. provisional orders, SQL text of `recalc_order_cost`) | **PASS (unit)**. Database side (`recalc_order_cost`, converter) is in migrations 33/39: NOT VERIFIED until applied. Schema change to record a *confirmed* zero is proposed, not made: `docs/proposed/20261040_order_costs_confirmed.sql` |
| D33 | Medium | A deactivated admin with a live session could still call server actions that check only the role: order costing, team role changes, settings and every action using `getProfile()`. | `getProfile()` returns null for an inactive profile; `updateTeamMember` and `updateOrgSettings` check `is_active`; role/activation changes are now audited | `scripts/test-actions-deactivated.mts` (fails without the fix: confirmed by reverting it) | **PASS (fake-DB action test)**; database helpers: migration 39, NOT VERIFIED |
| D34 | Medium | `recalc_order_cost` had no caller check and stored `value − partial costs` as profit | Migration 39 section 6 | `scripts/test-order-costing.mts` pins the SQL text; behaviour against the database NOT VERIFIED | open until applied |
| D35 | Decision | Quotation conversion invented a cost (62% of price) when none existed | Option B in migration 33 | `scripts/test-order-cost-rule.mts` (text) + `convertedOrderCost` reference in `test-order-costing.mts`; real-DB behaviour NOT VERIFIED | open until applied |

Verified, no change needed: every in-app user-creation path (company client login, team invite, portal invite, public sign-up) sets role and company explicitly afterwards, so migration 38 (which ignores sign-up metadata) does not break them; all other staff server actions that use the service-role client begin with a role guard.

Not re-audited in this session (relied on the 27 October audit, D1 to D31, and its tests): B2C checkout and reconciliation, requirement/quotation action authorisation, notification ledger, rate limits. They still await real-database confirmation.

These items are **FAIL on the live database today** and become PASS only after the migrations are applied and the post-apply checks below are run. Static review and the offline parser are not proof.

Real-database security tests (items 1 to 17 above plus L1 to L5) are **BLOCKED on the migrations being applied**; none has been run.

## Security findings

Critical D21 (privilege escalation at sign-up) and the High items D2, D3, D5, D6, D11, D13, D17, D22, D23, D26 (costs in the audit log) and D29 (supplier permission bypass) were closed in code or in migration 38. The database items protect nothing until migration 38 is applied. The cost protection from migrations 35 and 37 and every RLS policy remain unverified until a database exists. No credential, key or token appears in any file written.

## Database-dependent checks to repeat when Supabase returns

1. Apply migrations 26 to 39 in order (31 before 37; 33 and 38 in the same sitting); run each file's verification queries and the batch queries in `docs/DATABASE_MIGRATION_RUNBOOK.md` section 5.
2. Anon-key and client-role queries for `products.supplier_cost`, `orders.product_cost`, `select=*` (must be refused) and `select=id,name,price` (must work).
3. Two companies: each sees only their own requirements, quotations, orders, team, documents, notifications.
4. A visitor calling Supabase Auth sign-up with `role: admin` in user metadata gets `client_user` with no company (D21).
5. A signed-in sales user writing `workflow_stage` directly through the API is refused; the portal and CRM transitions still work (D22).
6. A client calling `quotation_accepted_items` for another company's quotation gets nothing (D23).
7. Insert a payment above the outstanding amount (refused), and two concurrent payments that together exceed it (second refused) (D24).
8. A client cannot insert a notification or change a title; marking read still works (D25).
9. Task "Blocked" saves (D10); item-level and whole-quotation acceptance after validity date is refused (D16).
10. Demo payment end to end; callback duplicate; reconcile with stuck and paid-without-order payments.
11. `move_sample` concurrency; atomic stock counts.
12. Shared rate limiter (migration 36): the 6th enquiry is refused and counters survive a restart.
13. Real email and WhatsApp delivery, including a retried failed email and the product-available email after a simulated failure.
14. Audit log (D26): after migration 38, edit a product's supplier cost as admin and an order's costing as accounts; the new `audit_logs` rows contain `restricted_fields_changed` and no figure. As a sales user, a select on `audit_logs` returns none of your own product or order rows; as admin and management it returns everything. A client cannot insert into `audit_logs`, and sales can only insert as themselves. `select public.audit_redact('products', '{"name":"x","supplier_cost":5}')` returns no `supplier_cost`.
15. Decide whether to run the optional scrub of historic audit rows (backup first), then check that no `audit_logs` row for `orders`, `products`, `order_items`, `product_suppliers` still contains a cost key.
16. Supplier permissions (D29, D30): as management, the partner screens cannot touch suppliers; a blocked supplier cannot be assigned to an order line.
17. Run the whole migration set first on a scratch database or Supabase branch (see R7), then on production.

## Decisions kept at the secure default (not guessed)

- Company auto-linking by email domain: not implemented; admin or the client's administrator creates the link.
- Which internal roles may see costs and margins: order and product costs admin, accounts, management; supplier mapping cost needs the `suppliers.cost_view` permission. **Still open for your decision.**
- Unknown supplier cost on quotation conversion: **decided, option B** (28 Oct 2026): never invent a cost or margin.
- Requirement scope after approval: budget and quantity are frozen for client-workflow requirements once approved (application and migration 38). Tell me if staff should be able to change them.
