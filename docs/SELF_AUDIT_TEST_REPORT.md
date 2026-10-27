# Self-audit test report

Date: 27 October 2026. Scope: the Robust Gifting CRM against `Robust Gifting CRM - Scope of Work-final.pdf`.
Local URL: http://localhost:3000. Supabase project `zrfetfibatcuvwogyvjn` was **not contacted**; no migration was applied; nothing was committed, pushed or deployed; no business data (the 524 products, companies, contacts, orders, invoices) was read or changed.

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
| `npm test` (runs every `scripts/test-*.mts`, requires exit 0 and an "assertions passed" line, then the SQL syntax check) | 33 test files, 33 passed, 0 failed; migration syntax PASS (all 13 pending migrations parse) |
| `npx tsc --noEmit` | 0 errors |
| `npx eslint .` | 81 problems (60 errors, 21 warnings) = the original baseline of 81. None are in files added by this audit; the touched-file findings are pre-existing (dashboard `react-hooks` rules, unused icons in `invoices/[id]`, `checkout/page.tsx`) |
| `npm run build` | Compiled successfully, 90/90 pages |
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

## Security findings

Critical D21 (privilege escalation at sign-up) and the High items D2, D3, D5, D6, D11, D13, D17, D22, D23, D26 (costs in the audit log) and D29 (supplier permission bypass) were closed in code or in migration 38. The database items protect nothing until migration 38 is applied. The cost protection from migrations 35 and 37 and every RLS policy remain unverified until a database exists. No credential, key or token appears in any file written.

## Database-dependent checks to repeat when Supabase returns

1. Apply migrations 26 to 38 in order; run each file's verification queries (migration 38's are at the bottom of the file).
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
- Which internal roles may see costs and margins: order and product costs admin, accounts, management; supplier mapping cost needs the `suppliers.cost_view` permission.
- Requirement scope after approval: budget and quantity are frozen for client-workflow requirements once approved (application and migration 38). Tell me if staff should be able to change them.
