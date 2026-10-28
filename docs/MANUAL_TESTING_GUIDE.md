# Manual acceptance testing guide — Robust Gifting CRM

Local URL: `http://localhost:3000` (or the deployed URL when you test there).
Status of this guide (updated 28 October 2026): migrations 26 to 39 are applied, and 223 checks (saved as `scripts/db-tests/*.sql`, rerunnable) passed **directly against the live database** (as the real database roles, rolled back afterwards; see `docs/DATABASE_MIGRATION_RUNBOOK.md` section 0). So wherever the "Automated result" column says "DB: not run" for a rule that lives in the database (permissions, cost privacy, isolation, workflow guards, quotation decisions, order conversion and costing, payments, stage history, sample stock), read it as **already PASS at the database layer**; you still need to confirm the *screen* behaves the same, which is what these manual tests are for.

**BLOCKER FOR ALL MANUAL TESTS: Supabase has restricted the project's data API (HTTP 402 `exceed_egress_quota`, Free plan). Sign-in and every page that reads data will fail for everyone until you upgrade the plan (or remove the spend cap) or the quota resets.** Do not start these tests before `http://localhost:3000/login` can sign in again. Your manual acceptance has **not** happened yet.

## Before you start

1. Migrations 20261026 to 20261039: **applied and verified on 28 Oct 2026.** The Supabase data API must be working again (see the blocker above).
2. Test accounts (never use real customer addresses): one per role: Admin, Sales, Operations, Accounts, Management, Client Admin and Client User of **two different companies** (call them Company A and Company B). Use e-mail addresses you control. Passwords are never written in this document.
3. Everything you create is named with the prefix **ZZ-TEST** so it can be found and cleaned up. Do **not** edit or delete any of the 524 real products; tests that need a product use an existing one read-only, or a ZZ-TEST product you create.
4. PayU stays in demo mode. WhatsApp stays in outbox mode (messages are queued, nothing is sent). Tests that need real PayU or WhatsApp credentials are marked **[NEEDS PAYU]** or **[NEEDS WHATSAPP]** and cannot be run yet.
5. Record the result in the **Result** column: PASS, FAIL (write what you saw) or BLOCKED.

Legend for "Automated result": **Unit** = logic tested without a database; **Fake-DB action** = server action tested against an in-memory database (not the real one); **DB: not run** = needs the real database; **Manual only** = cannot be automated.

---

## Group 1. Public website and B2B / B2C switch

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-01 | Anonymous | `/home` (also `/`) | Click the B2B / B2C switch in the header, then refresh the page, then open `/catalogue`. | Selected mode stays after refresh; B2C shows the online store, B2B shows the corporate pages. | Code review only | |
| M-02 | Anonymous | `/request-quote` | Fill name `ZZ-TEST Visitor`, your e-mail, phone `9876543210`, quantity `50`, message `ZZ-TEST enquiry`; submit. Submit the same form 6 times quickly. | First submit shows a confirmation. The 6th submission within the window is refused with a "too many requests" message. A staff notification appears under `/crm/notifications` for the first only. | Unit; DB-backed limiter: DB not run | |
| M-03 | Anonymous | `/track-order` | Enter an existing order number from `/crm/orders` (a ZZ-TEST B2C order from M-30) with its e-mail; then repeat with the right number and a wrong e-mail. | Right pair shows status and stages with no costs or supplier names; wrong pair shows a generic "not found". | Unit; DB: not run | |
| M-04 | Anonymous | Any page at phone width (375px, browser dev tools) | Open `/home`, `/cart`, `/request-quote`, `/track-order`, `/login`, `/signup`. | No sideways scrolling; menus usable. | Browser 375px: PASS on 27 Oct for these six pages | |

## Group 2. Client login and company-specific catalogues

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-05 | Client Admin A | `/login` then `/portal` | Sign in. | Lands on Products (`/portal/catalogue`), never on `/crm/...`. | DB: not run | |
| M-06 | Client Admin A | `/crm/dashboard` typed in the address bar | Sign in as client, then type the URL. | Redirected to the portal or "access denied"; no CRM data shown. | DB: not run | |
| M-07 | Admin | `/crm/products/catalogues` | Create catalogue `ZZ-TEST Catalogue A`, add 3 existing products, assign to Company A only, publish. | Client Admin A sees it under `/portal/catalogues`. | DB: not run | |
| M-08 | Client Admin B | `/portal/catalogues` | Sign in as Company B. | Catalogue A is **not** listed; opening its address from Company A's session URL shows not found. | DB: not run | |
| M-09 | Admin | catalogue page | Unpublish `ZZ-TEST Catalogue A`. | Disappears for Company A after refresh. Re-publish and it returns. | DB: not run | |
| M-10 | Admin | catalogue page | Duplicate the catalogue and assign the copy to Company A **and** B. | Both companies see the copy. | DB: not run | |
| M-11 | Admin | `/crm/products/<ZZ-TEST product>` | Create `ZZ-TEST Product B2C` with sales channel **B2C only**. Look in `/portal/catalogue` as Client A and in `/catalogue` anonymously. | Hidden from the B2B portal, visible in the online store. Set to **B2B only**: reversed. | Unit; DB: not run | |
| M-12 | Client A | `/portal/catalogue` | Search `ZZ-TEST`; filter by a category. | Results match; counts correct. | DB: not run | |

## Group 3. Shortlist and sample requests

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-13 | Client User A | `/portal/catalogue` → `/portal/shortlist` | Add 2 products to the interest list ("shortlist"), change a quantity, remove one. | List saved after refresh; staff see it on the company page. | Fake-DB action; DB: not run | |
| M-14 | Client User A | product page | Request a sample of a ZZ-TEST product. | Request appears in `/portal/...` and in `/crm/samples` as pending; staff notification created once. | Fake-DB action; DB: not run | |
| M-15 | Operations | `/crm/samples` | Approve, ship, then reject another request. Receive 5 units into office stock, move 2 to client, try to move 10 from office. | Stock counts add up (5 → 3 office, 2 client); the move of 10 is refused with "Not enough samples"; every move appears in history. | Fake-DB action; real atomicity: DB not run | |

## Group 4. Requirement creation, approval, confirmation and selection

Use Company A. Names start with `ZZ-TEST`.

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-16 | Client Admin A | `/portal/requirements/new` | Name `ZZ-TEST Diwali 2026`, purpose `Festival gifting`, budget `500000`, quantity `100`, deadline 45 days out, location `Pune`, notes `ZZ-TEST`. Submit, then press the button again quickly. | One requirement, status "Submitted"; a second click does not create a duplicate. Appears in `/crm/requirements` under Company A. | Fake-DB action; DB: not run | |
| M-17 | Admin | `/crm/requirements/<id>` | Choose **Request changes** without a note, then with a note `Please add delivery dates`. | Without note it is refused; with note the client sees "Changes requested" and the note. | DB: not run | |
| M-18 | Client Admin A | requirement page | Edit, resubmit. | Back to "Submitted". | DB: not run | |
| M-19 | Admin | requirement page | **Approve**. | Client sees "Approved, please confirm". Budget and quantity can no longer be edited by staff. | DB: not run | |
| M-20 | Client Admin A | requirement page | **Confirm**. Try to submit a product selection before confirming (use a second requirement). | Confirm unlocks product selection; selecting before confirmation is not possible. | DB: not run | |
| M-21 | Client Admin A | requirement page | Select products with total **below** budget; then raise quantities until the total is **above** budget; submit. | Totals match unit price × quantity; an above-budget warning shows; submission is allowed. | Unit totals; DB: not run | |
| M-22 | Admin | requirement page | **Request changes** on the selection, client adjusts and resubmits, admin **approves** selection. | Stages move in order; client and admin screens show the same stage after refresh and after signing out and in. | DB: not run | |
| M-23 | Admin (reject path) | a second ZZ-TEST requirement | Reject it with a note. | Client sees "Not accepted" with the reason; it cannot be revived by the client. | DB: not run | |
| M-24 | Sales (not owner) | `/crm/requirements/<id>` of another user's requirement | Open the address directly. | Not found / no access. | DB: not run | |

## Group 5. Quotation and order conversion

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-25 | Sales/Admin | requirement page → create quotation | Create the draft from the approved selection; set valid-until to yesterday and try **Send**; then set a future date and send. | Past date is refused; future date sends. Client gets an in-app notification and an e-mail (use a safe address). | Fake-DB action; DB: not run | |
| M-26 | Client Admin A | `/portal/quotations/<id>` | Accept 2 items and reject 1; submit. | Quotation shows partly accepted; total shown equals accepted lines only (with the quotation's discount and tax). | Unit; DB: not run | |
| M-27 | Client Admin A | same quotation | Submit a second time. | Refused ("can no longer be answered"). | DB: not run | |
| M-28 | Admin | `/crm/quotations/<id>` | **Convert to order** twice. | One order only, containing the 2 accepted lines; order value equals the accepted total. As Admin/Accounts/Management, the order's Financials tab shows **"Costs not entered"** (no profit, no margin) because the products have no supplier cost; no invented cost appears anywhere. Profit appears (as provisional, then verified) only as you enter costs: see M-37b. If instead every accepted product has a supplier cost, the product cost equals the sum of quantity × cost, but profit is still not verified until printing, courier and other cost are entered. | DB-level uniqueness verified by schema only; behaviour: DB not run | |
| M-29 | Client Admin B | typed address of Company A's quotation | Open `/portal/quotations/<id of A>`. | Not found. | DB: not run | |

## Group 6. Orders and the eight fulfilment stages

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-30 | Operations | `/crm/orders/<ZZ-TEST order>` | Move the order through **Received → Planning → Procurement → Printing → Quality check → Packed → In transit → Delivered**, adding assignee, due date and a comment at each step. | Each step is saved once in the history with who, when, assignee and due date; customer view uses the customer wording; a task is created for the matching stages; delivered sets the delivery date. | Fake-DB action; DB: not run | |
| M-31 | Sales and Management | order page | Try to change the stage. | Refused ("Not permitted"); only Admin, Operations (and Accounts for delivered) can. | DB: not run | |
| M-32 | Client Admin A | `/portal/orders/<id>` | Watch the status after each step in M-30. | Customer sees the matching label and a notification per change, **no costs, margins or supplier names anywhere on the page**. | DB: not run | |

## Group 7. Supplier management and order costing

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-33 | Operations | `/crm/suppliers` | Create `ZZ-TEST Supplier 1` and `2`; on a ZZ-TEST product add both with costs 100 and 120, mark Supplier 2 preferred. | Preferred supplier shown; cost visible to Operations. | DB: not run | |
| M-34 | Operations | order line | Assign Supplier 2 to a line, note the cost snapshot; then change Supplier 2's cost to 150. | The existing order line keeps the old snapshot; a new order uses the new cost. | Fake-DB action; DB: not run | |
| M-35 | Operations | `/crm/suppliers/bulk` and `/crm/suppliers/vendor-report` | Bulk-assign ZZ-TEST products to Supplier 1; export the vendor report CSV. | Assignment applied; CSV opens with supplier data only for permitted users. | Unit (report); DB: not run | |
| M-36 | Sales | `/crm/products/<id>`, `/crm/orders/<id>` | Open as Sales. | **No** supplier cost, margin, internal notes or order cost figures visible, anywhere (also not in exports). | DB: not run | |
| M-37 | Accounts / Admin / Management | order page Financials tab | Open as each. | Costs and (when entered) gross profit visible. If you want a different set of roles to see costs, tell me; this is a pending business decision. | DB: not run | |
| M-37b | Admin | order page → Financials tab, on the ZZ-TEST order from M-28 (order value e.g. `10000`) | (1) Look before entering anything. (2) Enter **only** Printing cost `500` and save. (3) Add Product cost `6000` and save. (4) Add Courier `250`, save. (5) Add Other cost `100`, save. | (1) "Costs not entered", no profit or margin; each cost line says "Not entered". (2) Total 500, **no profit or margin**: "Product cost not entered, so profit and margin are not shown". (3) An **amber "Provisional profit / margin"** with the sentence that the system cannot tell a real zero from a cost not yet entered; it is never shown as plain "Gross profit". (4) Still provisional (other cost is 0). (5) Now plain **"Gross profit" 3150 and "Margin" 31.5%**. Business check: if one component is genuinely zero, the order stays provisional; tell me if you want the proposed "confirm costing" option (`docs/proposed/20261040_order_costs_confirmed.sql`). | Unit (rule); DB: not run | |
| M-37c | Management | `/crm/dashboard` | Compare the "Gross margin (fully costed orders)" card with M-37b at each step. | Only fully costed orders are summed; the note says "N fully costed, M provisional (not counted), K not costed"; with no fully costed order it reads "No order fully costed", never ₹0 profit and never a provisional figure. | Unit; DB: not run | |
| M-38 | Operations | order line with a blocked supplier | Assign a supplier set to "blocked". | A clear error, no assignment. | Fake-DB action; DB: not run | |

## Group 8. Samples and inventory movement

Covered by M-14 and M-15. Additionally:

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-39 | Operations | `/crm/samples` | Move 1 unit from client to **team**, then back to office. | Both moves accepted and visible in movement history (this failed before migration 34). | DB: not run | |

## Group 9. B2C personalisation, cart and checkout

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-40 | Anonymous | `/personalized` → product → `/cart` → `/checkout` | Pick a personalisable product, add text `ZZ-TEST Rahul` and upload a small PNG; add to cart; change quantity; remove and re-add. | Customisation kept; totals recomputed on the server (editing the price in the browser changes nothing). | Unit; DB: not run | |
| M-41 | Anonymous | `/checkout` | Try invalid data one at a time: phone `12345`, PIN `12345`, e-mail `abc`, empty address. Then valid: phone `9876543210`, PIN `411001`, your e-mail, address `ZZ-TEST 1 Test Road, Pune`. | Each invalid field is refused with a clear message; valid data proceeds to review. | Unit | |
| M-42 | Admin | `/crm/settings` | Set delivery charge to a **test** value you choose and a free-delivery threshold; place an order below and above it. | Charge added below the threshold and free above it. (Real values come from the client; none are assumed.) | Unit; DB: not run | |

## Group 10. Payment failure, retry and reconciliation (demo mode)

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-43 | Anonymous | `/checkout/<id>/pay` | Press **Simulate Failure** in the demo. | No order or invoice for this checkout appears in `/crm/orders`; retry is offered. | Fake-DB action; DB: not run | |
| M-44 | Anonymous | pay page | Retry and press **Simulate Success**; then press browser Back and try to pay again. | Exactly one order, one invoice, one payment; confirmation page shows the order number; e-mail received once. | Fake-DB action; DB: not run | |
| M-45 | Anonymous | pay page in a private window | Press **Cancel** instead of paying. | Checkout stays unpaid, no order. | DB: not run | |
| M-46 | Developer-assisted | confirmation URL | Copy the demo completion link of an unpaid checkout and open it for a different checkout. | Refused (cannot be forged across checkouts). | Fake-DB action; DB: not run | |
| M-47 | Admin | cron call `/api/payments/reconcile` | With the `CRON_SECRET` (kept private), call once without and once with the secret. | Without: 401. With: JSON summary; a second run changes nothing. | Unit; DB: not run | |
| M-48 | — | PayU live checkout | **[NEEDS PAYU]** real credentials, a real small payment and a real failure. | | BLOCKED | |

## Group 11. Invoices, payables, payments and dashboard totals

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-49 | Accounts | `/crm/invoices/<id>` | Create an invoice for the ZZ-TEST order; add payment of 40% then 60%; try a further payment of 1. | Status unpaid → partially paid → paid; the extra payment is refused ("would exceed the invoice amount"). | Fake-DB action; DB trigger: not run | |
| M-50 | Accounts | `/crm/payables` | Add a payable to ZZ-TEST Supplier 1, mark part paid. | Outstanding updates; overdue flag after due date. | Static status check; DB: not run | |
| M-51 | Management | `/crm/dashboard`, `/crm/receivables` | Compare totals with M-49 and with the paid B2C order of M-44. | Revenue excludes cancelled orders; B2C counts only paid orders; receivables equal unpaid invoice balance. | DB: not run | |
| M-52 | Sales | `/crm/payments` typed in the address bar | Open as Sales. | Access denied. | DB: not run | |

## Group 12. Products, CSV import, MRP and pricing rollback

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-53 | Admin | `/crm/products/import` | Download the template, add 2 rows `ZZ-TEST-001`, `ZZ-TEST-002` (and one duplicate SKU, one invalid price); run **Validate**. | Row-level errors and duplicate warning; nothing imported yet. Import the two valid rows only. Never import the real 524-product file again. | Unit; DB: not run | |
| M-54 | Admin | `/crm/products/pricing` | On the two ZZ-TEST products only: apply a +10% change; then **Roll back** that batch. | Prices change, history shows the batch, rollback restores the previous price and records itself. | Unit; DB: not run | |
| M-55 | Admin | any real product | Look only, do not save. Confirm count shows **524** real products plus your ZZ-TEST ones; spot check 5 SKUs starting `HGS-`. | Unchanged names, SKUs, prices, images. | Read-only DB baseline recorded (524, fingerprint) | |

## Group 13. Role permissions and cross-company isolation

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-56 | Admin | `/crm/settings/permissions` | Remove `module.catalogues` from Sales, sign in as Sales. | Catalogues menu hidden and `/crm/products/catalogues` blocked; restore afterwards. | DB: not run | |
| M-57 | Client Admin A | `/portal/team` | Invite a ZZ-TEST client user (your e-mail). | User created in Company A only; cannot be moved to Company B. | DB: not run | |
| M-58 | Client User A | `/portal/team` | Open. | No team management. | DB: not run | |
| M-59 | Admin | `/crm/team` | Deactivate a ZZ-TEST sales user; that user (already signed in elsewhere) clicks around and refreshes. | Loses access immediately (the database now also refuses). | DB: not run | |
| M-60 | Visitor | `/signup` | Create an account with a new e-mail. | Becomes a client with **no company and no CRM access**; never staff or admin. | DB: not run | |

## Group 14. Email and WhatsApp notification flows

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-61 | Admin | `/crm/notifications` | After the flows above, check the outbox list. | One row per event (requirement, quotation, order, sample, product available), none duplicated; WhatsApp rows are "queued" or "skipped", never "sent" (no provider). | Fake-DB action; DB: not run | |
| M-62 | Admin | `/crm/notifications` | Re-queue a failed row (if any) once. | Becomes queued once; no duplicate on repeat. | Fake-DB action; DB: not run | |
| M-63 | Inbox | the safe test address | Confirm e-mails arrived once each with no supplier name, cost or margin. | | Manual only (Resend) | |
| M-64 | — | Live WhatsApp | **[NEEDS WHATSAPP]** approved templates and credentials. | | BLOCKED | |

## Group 15. Public forms, rate limits and abuse protection

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-65 | Anonymous | `/login` | Optional (tedious): 31 wrong-password attempts from one device within 10 minutes. | The 31st is refused with a wait message (limit is 30 per 10 minutes per device). | Unit; DB: not run | |
| M-66 | Anonymous | `/forgot-password` | Request a reset 4 times within an hour for the same address. | The 4th is refused (limit 3 per hour per address); the message never reveals whether the address exists. | Unit | |

## Group 16. Responsive layout, PWA and launch readiness

| ID | Role | Path | Steps and data | Expected | Automated result | Result |
|---|---|---|---|---|---|---|
| M-67 | Client Admin A | `/portal/*` pages at 375px | Open Products, Requirements, Quotations, Orders, Team. | No sideways scrolling, buttons reachable. | Authenticated pages: not browsed yet | |
| M-68 | Admin | CRM pages at 375px | Open Dashboard, Orders, Quotations, Products. | Usable on a phone. | Not browsed yet | |
| M-69 | — | Launch | Real PayU keys, real MRP list, delivery charge values, WhatsApp templates, domain and e-mail sender, cron schedule, `CRON_SECRET`. | Listed in `docs/PENDING_WORK_AND_LAUNCH_CHECKLIST.md`. | BLOCKED on client input | |

---

## Cleanup of ZZ-TEST data

Do not bulk delete. After acceptance, tell me and I will propose a list of the exact ZZ-TEST records (by name and id) for you to approve before anything is removed. Real customer, order, invoice and payment records are never deleted.
