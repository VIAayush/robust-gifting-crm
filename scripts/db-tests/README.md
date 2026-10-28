# Real-database tests

Three self-contained SQL scripts that test the **live Supabase database** (grants, RLS, triggers, `SECURITY DEFINER`
functions) as the real roles `anon`, `authenticated` and `service_role`, using the existing staff and client accounts.
They are not part of `npm test` (which needs no database).

| File | Checks | Covers |
|---|---|---|
| `01-security.sql` | 89 | sign-up escalation, anonymous and unauthorised calls, profile-less caller, deactivated staff, cost protection, audit log, notifications |
| `02-requirements-quotations-samples.sql` | 83 | requirement isolation and workflow guards, quotation preparation / item decisions / expiry / isolation, sample stock atomicity, rate limiter |
| `03-orders-costing-finance.sql` | 51 | quotation to order, Option B costing, `recalc_order_cost` rule, invoices and payments, the eight fulfilment stages |

## How to run

Paste one whole file into the Supabase SQL Editor of project `zrfetfibatcuvwogyvjn` and run it. Each file impersonates a
role with `SET ROLE` plus JWT claims (the mechanism PostgREST uses), writes only inside one transaction and **ends with a
deliberate error** `RESULTS {...}` so that everything is rolled back. Nothing is persisted. Read the JSON in the error:

* `"failed": []` and `"passed"` equal to `"total"` means every check passed;
* any entry in `failed` shows the check number, the expected pattern and the actual value.

The scripts need no secrets. They hard-code the ids of the existing demo/staff accounts and the two test companies
(`c1000000-...-0010` and `-0011`); if an account is removed or deactivated, update the ids at the top of the `do` block.
Run them after any migration or policy change. Do not edit the transaction to commit.

## Results on 28 October 2026 (after migrations 20261026 to 20261039)

`01` 89 of 89, `02` 83 of 83, `03` 51 of 51: **223 of 223 passed**. After the runs the database was verified unchanged
(no leftover rows, no test users, 524-product fingerprint identical).

Three harness defects were fixed along the way and are fixed in these files: a column-name clash in the summary query,
a volatile function called inside a `WHERE` (the order it created was invisible to that same statement), and a check
helper that ignored NULL results (it now fails them). Two expectations were corrected (the client sees 4 visible
history events; several controls write audit rows for the same order). The stricter NULL handling was added to `01` and
`02` after their clean runs; those runs had `passed == total`, so they contained no NULL results.

## What these scripts do NOT cover

Concurrent sessions (two simultaneous payments or sample moves), the HTTP layer (PostgREST/Auth), the Next.js
application, and real PayU / e-mail / WhatsApp. See `docs/MANUAL_TESTING_GUIDE.md`.
