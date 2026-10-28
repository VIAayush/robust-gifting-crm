-- REAL-DATABASE TEST 03: quotation to order conversion, Option B costing, recalc_order_cost rule, invoices and
-- payments, the eight fulfilment stages. 51 checks (W5, W6, W7).
--
-- HOW TO RUN: paste the whole file into the Supabase SQL Editor of project zrfetfibatcuvwogyvjn and run it once.
-- Impersonates real roles with EXISTING accounts, writes only inside one transaction and ends with a DELIBERATE error
-- "RESULTS {...}" so everything is rolled back. Read the JSON: "failed": [] and "passed" == "total" means all passed.
-- It sets products.supplier_cost values inside the transaction only (rolled back) to exercise the costing rule.

create temp table res(n serial, label text, expect text, actual text, pass boolean);

create function pg_temp.ex(p_role text, p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare n bigint; v text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid::text, 'role', p_role)::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || quote_ident(p_role);
  begin execute p_sql; get diagnostics n = row_count; v := 'OK rows=' || n;
  exception when others then v := 'ERR ' || sqlstate || ' ' || left(sqlerrm, 100); end;
  execute 'reset role';
  return v;
end $f$;

create function pg_temp.val(p_role text, p_uid uuid, p_sql text) returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', case when p_uid is null then '' else json_build_object('sub', p_uid::text, 'role', p_role)::text end, true);
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  execute 'set local role ' || quote_ident(p_role);
  begin execute p_sql into v; v := coalesce(v, 'NULL');
  exception when others then v := 'ERR ' || sqlstate || ' ' || left(sqlerrm, 100); end;
  execute 'reset role';
  return v;
end $f$;

create function pg_temp.chk(p_label text, p_expect_regex text, p_actual text) returns void language plpgsql as $f$
begin insert into pg_temp.res(label, expect, actual, pass) values (p_label, p_expect_regex, coalesce(p_actual, 'NULL'), coalesce(p_actual ~ p_expect_regex, false)); end $f$;

create function pg_temp.conv(p_q uuid) returns text language sql as $f$
  select pg_temp.val('authenticated', '11111111-1111-4111-8111-111111111111'::uuid, format('select public.convert_quotation_to_order(%L::uuid)::text', p_q))
$f$;

create function pg_temp.summary() returns text language sql as $f$
  select jsonb_pretty(jsonb_build_object('total', count(*), 'passed', count(*) filter (where r2.pass),
    'failed', coalesce(jsonb_agg(jsonb_build_object('n', r2.n, 'label', r2.label, 'expect', r2.expect, 'actual', r2.actual)) filter (where not r2.pass), '[]'::jsonb)))
  from pg_temp.res r2
$f$;

do $t$
declare
  admin_ uuid := '11111111-1111-4111-8111-111111111111';
  sales_ uuid := '22222222-2222-4222-8222-222222222222';
  ops_   uuid := '33333333-3333-4333-8333-333333333333';
  acc_   uuid := '44444444-4444-4444-8444-444444444444';
  ca_    uuid := '66666666-6666-4666-8666-666666666666';
  cb_    uuid := '77777777-7777-4777-8777-777777777777';
  coA uuid := 'c1000000-0000-4000-8000-000000000010';
  pa uuid := (select id from public.products order by sku limit 1);
  pb uuid := (select id from public.products order by sku desc limit 1);
  q uuid; qd uuid; q4 uuid; q5 uuid; q6 uuid; o uuid; o4 uuid; o5 uuid; inv uuid; dept uuid; v text; st text; oc text;
begin
  insert into public.quotations(id, quotation_number, company_id, owner_id, status, valid_until, discount_percent, tax_percent) values (gen_random_uuid(), 'ZZ-Q1', coA, admin_, 'accepted', current_date + 10, 0, 18) returning id into q;
  insert into public.quotation_items(quotation_id, product_id, quantity, unit_price, client_decision) values (q, pa, 2, 100, 'accepted'), (q, pb, 3, 200, 'rejected');
  perform public.recalc_quotation_totals(q);
  insert into public.quotations(id, quotation_number, company_id, owner_id, status, valid_until) values (gen_random_uuid(), 'ZZ-QD', coA, admin_, 'sent', current_date + 10) returning id into qd;
  insert into public.quotation_items(quotation_id, product_id, quantity, unit_price) values (qd, pa, 1, 10);

  begin
    perform pg_temp.chk('W5a client cannot convert', '^ERR P0001 Not permitted to convert quotations', pg_temp.val('authenticated', ca_, format('select public.convert_quotation_to_order(%L::uuid)::text', q)));
    perform pg_temp.chk('W5a2 anon cannot convert', '^ERR 42501', pg_temp.val('anon', null, format('select public.convert_quotation_to_order(%L::uuid)::text', q)));
    perform pg_temp.chk('W5a3 operations passes the role gate but a quotation that is not accepted is refused', '^ERR P0001 Only accepted quotations can become orders', pg_temp.val('authenticated', ops_, format('select public.convert_quotation_to_order(%L::uuid)::text', qd)));
    perform pg_temp.chk('W5a4 an unknown quotation id is refused', '^ERR P0001 Quotation not found', pg_temp.val('authenticated', admin_, 'select public.convert_quotation_to_order(gen_random_uuid())::text'));
  exception when others then perform pg_temp.chk('SECTION ERROR W5a', '^$', sqlerrm); end;

  begin
    oc := pg_temp.conv(q);
    perform pg_temp.chk('W5b admin converts (order created)', '^[0-9a-f-]{36}$', oc);
    o := oc::uuid;
    select order_value::text||'|'||product_cost::text||'|'||total_cost::text||'|'||gross_profit::text into v from public.orders where id = o;
    perform pg_temp.chk('W5c order value = accepted total 236.00 (line 1 + 18% tax), costs and profit 0: nothing invented', '^236\.00\|0\.00\|0\.00\|0\.00$', v);
    perform pg_temp.chk('W5d only the accepted line becomes an order line (1, quantity 2)', '^1\|2$', (select count(*)::text||'|'||max(quantity)::text from public.order_items where order_id = o));
    perform pg_temp.chk('W5e converting twice returns the same order, no duplicate', '^true\|1$', (pg_temp.conv(q) = oc)::text||'|'||(select count(*)::text from public.orders where quotation_id = q));
    perform pg_temp.chk('W5f client A sees only company A orders', '^' || coA::text || '$', pg_temp.val('authenticated', ca_, 'select string_agg(distinct company_id::text, '','') from public.orders'));
    perform pg_temp.chk('W5g client B sees none of company A''s orders', '^0$', pg_temp.val('authenticated', cb_, 'select count(*)::text from public.orders'));
    update public.products set supplier_cost = 40 where id = pa; update public.products set supplier_cost = 50 where id = pb;
    insert into public.quotations(id, quotation_number, company_id, owner_id, status, valid_until, tax_percent) values (gen_random_uuid(), 'ZZ-Q4', coA, admin_, 'accepted', current_date + 5, 0) returning id into q4;
    insert into public.quotation_items(quotation_id, product_id, quantity, unit_price) values (q4, pa, 2, 100), (q4, pb, 3, 200);
    perform public.recalc_quotation_totals(q4);
    o4 := pg_temp.conv(q4)::uuid;
    select product_cost::text||'|'||total_cost::text||'|'||gross_profit::text||'|'||order_value::text into v from public.orders where id = o4;
    perform pg_temp.chk('W5i ALL lines costed: product cost = 40x2 + 50x3 = 230; profit stored 0 until every component is entered; value 800', '^230\.00\|230\.00\|0\.00\|800\.00$', v);
    update public.products set supplier_cost = 0 where id = pb;
    insert into public.quotations(id, quotation_number, company_id, owner_id, status, valid_until, tax_percent) values (gen_random_uuid(), 'ZZ-Q5', coA, admin_, 'accepted', current_date + 5, 0) returning id into q5;
    insert into public.quotation_items(quotation_id, product_id, quantity, unit_price) values (q5, pa, 2, 100), (q5, pb, 3, 200);
    perform public.recalc_quotation_totals(q5);
    o5 := pg_temp.conv(q5)::uuid;
    select product_cost::text||'|'||total_cost::text||'|'||gross_profit::text into v from public.orders where id = o5;
    perform pg_temp.chk('W5j ONE line with supplier cost 0 (unknown): whole order cost 0, nothing invented', '^0\.00\|0\.00\|0\.00$', v);
    update public.products set supplier_cost = null where id = pb;
    insert into public.quotations(id, quotation_number, company_id, owner_id, status, valid_until, tax_percent) values (gen_random_uuid(), 'ZZ-Q6', coA, admin_, 'accepted', current_date + 5, 0) returning id into q6;
    insert into public.quotation_items(quotation_id, product_id, quantity, unit_price) values (q6, pb, 3, 200);
    oc := pg_temp.conv(q6);
    select product_cost::text||'|'||gross_profit::text into v from public.orders where id = oc::uuid;
    perform pg_temp.chk('W5k a line with NULL supplier cost: cost 0, profit 0', '^0\.00\|0\.00$', v);
    perform pg_temp.chk('W5l admin enters printing and courier cost', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('update public.orders set printing_cost = 10, courier_cost = 5 where id = %L::uuid', o4)));
    perform pg_temp.ex('authenticated', admin_, format('select public.recalc_order_cost(%L::uuid)', o4));
    perform pg_temp.chk('W5m product+printing+courier entered but "other" not: total 245, stored profit stays 0 (not verified)', '^245\.00\|0\.00$', (select total_cost::text||'|'||gross_profit::text from public.orders where id = o4));
    perform pg_temp.ex('authenticated', admin_, format('update public.orders set other_cost = 3 where id = %L::uuid', o4));
    perform pg_temp.ex('authenticated', admin_, format('select public.recalc_order_cost(%L::uuid)', o4));
    perform pg_temp.chk('W5n all four components entered: profit = 800 - (230+10+5+3) = 552.00', '^248\.00\|552\.00$', (select total_cost::text||'|'||gross_profit::text from public.orders where id = o4));
    perform pg_temp.chk('W5o sales cannot read that order''s cost columns', '^ERR 42501', pg_temp.ex('authenticated', sales_, format('select total_cost, gross_profit from public.orders where id = %L::uuid', o4)));
    perform pg_temp.chk('W5p client cannot read them either', '^ERR 42501', pg_temp.ex('authenticated', ca_, format('select product_cost from public.orders where id = %L::uuid', o4)));
  exception when others then perform pg_temp.chk('SECTION ERROR W5', '^$', sqlerrm); end;

  begin
    insert into public.invoices(invoice_number, order_id, company_id, due_date, amount) values ('ZZ-INV-1', o, coA, current_date + 30, 1000) returning id into inv;
    perform pg_temp.chk('W6a a second invoice for the same order is refused (unique)', '^ERR 23505', pg_temp.ex('postgres', null, format('insert into public.invoices(invoice_number, order_id, company_id, due_date, amount) values (''ZZ-INV-2'', %L::uuid, %L::uuid, current_date, 5)', o, coA)));
    perform pg_temp.chk('W6b sales cannot record a payment', '^ERR 42501', pg_temp.ex('authenticated', sales_, format('insert into public.payments(invoice_id, amount) values (%L::uuid, 100)', inv)));
    perform pg_temp.chk('W6c client cannot record a payment', '^ERR 42501', pg_temp.ex('authenticated', ca_, format('insert into public.payments(invoice_id, amount) values (%L::uuid, 100)', inv)));
    perform pg_temp.chk('W6d accounts records 600', '^OK rows=1', pg_temp.ex('authenticated', acc_, format('insert into public.payments(invoice_id, amount) values (%L::uuid, 600)', inv)));
    perform pg_temp.chk('W6e invoice is partially paid', '^partially_paid$', (select status::text from public.invoices where id = inv));
    perform pg_temp.chk('W6f a payment that would overpay (500 with 400 left) is refused', '^ERR P0001 Payments \(1100', pg_temp.ex('authenticated', acc_, format('insert into public.payments(invoice_id, amount) values (%L::uuid, 500)', inv)));
    perform pg_temp.chk('W6g zero payment refused', '^ERR P0001 A payment must be greater than zero', pg_temp.ex('authenticated', acc_, format('insert into public.payments(invoice_id, amount) values (%L::uuid, 0)', inv)));
    perform pg_temp.chk('W6h negative payment refused', '^ERR (P0001|23514)', pg_temp.ex('authenticated', acc_, format('insert into public.payments(invoice_id, amount) values (%L::uuid, -50)', inv)));
    perform pg_temp.chk('W6i editing a payment upward past the invoice is refused', '^ERR P0001 Payments \(', pg_temp.ex('authenticated', acc_, format('update public.payments set amount = 1200 where invoice_id = %L::uuid', inv)));
    perform pg_temp.chk('W6j accounts records the exact remaining 400', '^OK rows=1', pg_temp.ex('authenticated', acc_, format('insert into public.payments(invoice_id, amount) values (%L::uuid, 400)', inv)));
    perform pg_temp.chk('W6k invoice is paid, payments total 1000', '^paid\|1000\.00$', (select i.status::text||'|'||(select sum(amount) from public.payments where invoice_id = inv)::text from public.invoices i where i.id = inv));
    perform pg_temp.chk('W6l one more cent is refused', '^ERR P0001 Payments \(', pg_temp.ex('authenticated', acc_, format('insert into public.payments(invoice_id, amount) values (%L::uuid, 0.01)', inv)));
    perform pg_temp.chk('W6m client A cannot read payments', '^0$', pg_temp.val('authenticated', ca_, 'select count(*)::text from public.payments'));
  exception when others then perform pg_temp.chk('SECTION ERROR W6', '^$', sqlerrm); end;

  begin
    select id into dept from public.departments where slug = 'operations';
    perform pg_temp.chk('W7a sales cannot change a stage', '^ERR P0001 Not permitted to change order stages', pg_temp.ex('authenticated', sales_, format('select public.advance_order_stage(%L::uuid, ''confirmed'')', o)));
    perform pg_temp.chk('W7b client cannot change a stage', '^ERR P0001 Not permitted to change order stages', pg_temp.ex('authenticated', ca_, format('select public.advance_order_stage(%L::uuid, ''confirmed'')', o)));
    perform pg_temp.chk('W7c anon cannot change a stage', '^ERR 42501', pg_temp.ex('anon', null, format('select public.advance_order_stage(%L::uuid, ''confirmed'')', o)));
    perform pg_temp.chk('W7d accounts cannot move an operational stage', '^ERR P0001 Accounts cannot change this operational stage', pg_temp.ex('authenticated', acc_, format('select public.advance_order_stage(%L::uuid, ''procurement'')', o)));
    foreach st in array array['confirmed','procurement','printing','quality_check','ready_to_dispatch','dispatched','delivered'] loop
      perform pg_temp.chk('W7 stage -> ' || st, '^OK rows=1', pg_temp.ex('authenticated', ops_, format('select public.advance_order_stage(%L::uuid, %L::public.order_status, %L::uuid, %L::uuid, ''ZZ ''||%L, current_date + 3, ''next step'')', o, st, ops_, dept, st)));
    end loop;
    perform pg_temp.chk('W7e exactly 7 history rows for 7 stage changes (no duplicates)', '^7$', (select count(*)::text from public.order_status_history where order_id = o));
    perform pg_temp.chk('W7f history keeps assignee, department and due date on every row', '^7$', (select count(*)::text from public.order_status_history where order_id = o and assigned_to = ops_ and department_id = dept and stage_due_at = current_date + 3));
    perform pg_temp.chk('W7g delivered sets the delivery date', '^true$', (select (actual_delivery_date is not null)::text from public.orders where id = o));
    perform pg_temp.chk('W7h tasks were created for the stages (>= 7 incl. the conversion task)', '^([7-9]|[1-9][0-9])$', (select count(*)::text from public.tasks where order_id = o));
    perform pg_temp.chk('W7i the client got one portal notification per stage (7)', '^7$', pg_temp.val('authenticated', ca_, format('select count(*)::text from public.notifications where link = %L', '/portal/orders/' || o::text)));
    perform pg_temp.chk('W7j client B sees none of them', '^0$', pg_temp.val('authenticated', cb_, format('select count(*)::text from public.notifications where link = %L', '/portal/orders/' || o::text)));
    perform pg_temp.chk('W7k staff notifications use the /crm link (7)', '^7$', (select count(*)::text from public.notifications where audience = 'internal' and link = '/crm/orders/' || o::text and title like '%moved to%'));
    perform pg_temp.chk('W7l accounts CAN mark an order delivered (control)', '^OK rows=1', pg_temp.ex('authenticated', acc_, format('select public.advance_order_stage(%L::uuid, ''delivered'')', o4)));
    perform pg_temp.chk('W7m an order can be moved backwards by operations (stages are free-form by design; recorded, not a defect)', '^OK rows=1', pg_temp.ex('authenticated', ops_, format('select public.advance_order_stage(%L::uuid, ''created'')', o)));
  exception when others then perform pg_temp.chk('SECTION ERROR W7', '^$', sqlerrm); end;

  raise exception 'RESULTS %', pg_temp.summary();
end
$t$;
