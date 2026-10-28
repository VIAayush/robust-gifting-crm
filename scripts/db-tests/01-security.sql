-- REAL-DATABASE TEST 01: security (sign-up, anonymous and unauthorised calls, missing profile, deactivated staff,
-- cost protection, audit log, notifications). 89 checks.
--
-- HOW TO RUN: paste the whole file into the Supabase SQL Editor of project zrfetfibatcuvwogyvjn and run it once.
-- It impersonates the real database roles (SET ROLE anon|authenticated|service_role plus JWT claims, the same mechanism
-- PostgREST uses) using EXISTING accounts, writes only inside one transaction and ends with a DELIBERATE error
-- "RESULTS {...}" so that everything is rolled back. Nothing is persisted. Read the JSON in the error text:
--   "failed": []  and  "passed" == "total"  means every check passed.
-- The account ids below are the existing demo/staff accounts (see select role, id from public.profiles).
-- If an account is deactivated or removed, update the ids first.

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
  mgmt_  uuid := '55555555-5555-4555-8555-555555555555';
  ca_    uuid := '66666666-6666-4666-8666-666666666666';
  nobody uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  coA uuid := 'c1000000-0000-4000-8000-000000000010';
  coB uuid := 'c1000000-0000-4000-8000-000000000011';
  ord uuid := (select id from public.orders order by order_number limit 1);
  prod uuid := (select id from public.products order by sku limit 1);
  u uuid; v text; fn text;
  anon_calls text[] := array[
    format('select public.assign_order(%L::uuid, null, null, ''x'')', ord),
    format('select public.notify_users(''client'', %L::uuid, ''t'', ''b'', ''/portal'')', coA),
    format('select public.recalc_order_cost(%L::uuid)', ord),
    'select public.recalc_quotation_totals(gen_random_uuid())',
    'select public.refresh_invoice_status(gen_random_uuid())',
    'select public.record_campaign_event(gen_random_uuid(), ''x'', ''{}'')',
    format('select public.advance_order_stage(%L::uuid)', ord),
    'select public.convert_quotation_to_order(gen_random_uuid())',
    format('select public.provision_client_user(''a@b.test'', ''n'', ''pw12345678'', %L::uuid, ''client_user'')', coA),
    'select public.duplicate_quotation(gen_random_uuid())',
    'select public.client_respond_quotation(gen_random_uuid(), true, ''x'')',
    'select public.client_set_campaign_status(gen_random_uuid(), ''client_viewed'')',
    format('select public.move_sample(%L::uuid, 1, ''office'', ''client'')', prod),
    format('select public.receive_sample(%L::uuid, 1)', prod),
    'select public.requirement_transition(gen_random_uuid(), ''admin_approved'')',
    'select public.rate_limit_check(''t'', ''k'', 2, 60)',
    format('select public.order_cost_summary(array[%L::uuid])', ord),
    format('select public.product_cost_summary(array[%L::uuid])', prod)
  ];
begin
  -- S1 sign-up cannot assign a privileged role from user-controlled metadata
  u := gen_random_uuid();
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated','authenticated','zz-test-s1@example.test','x','{"provider":"email"}'::jsonb, jsonb_build_object('full_name','ZZ Test','role','admin','company_id',coA::text), now(), now(), '', '', '', '');
  select role::text||'/'||coalesce(company_id::text,'null') into v from public.profiles where id = u;
  perform pg_temp.chk('S1a sign-up metadata role=admin + company -> must become client_user/no company', '^client_user/null$', v);
  u := gen_random_uuid();
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated','authenticated','zz-test-s1b@example.test','x','{"provider":"email"}'::jsonb, '{"role":"sales"}'::jsonb, now(), now(), '', '', '', '');
  select role::text||'/'||coalesce(company_id::text,'null') into v from public.profiles where id = u;
  perform pg_temp.chk('S1b sign-up metadata role=sales -> client_user', '^client_user/null$', v);
  u := gen_random_uuid();
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated','authenticated','zz-test-s1c@example.test','x', jsonb_build_object('provider','email','role','sales'), '{}'::jsonb, now(), now(), '', '', '', '');
  select role::text into v from public.profiles where id = u;
  perform pg_temp.chk('S1c server-set app_metadata role (admin API only) is still honoured', '^sales$', v);
  u := gen_random_uuid();
  insert into auth.users (instance_id,id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,email_change,email_change_token_new,recovery_token)
  values ('00000000-0000-0000-0000-000000000000', u, 'authenticated','authenticated','zz-test-s1d@example.test','x', jsonb_build_object('provider','email','role','superuser'), '{}'::jsonb, now(), now(), '', '', '', '');
  select role::text||'/'||coalesce(company_id::text,'null') into v from public.profiles where id = u;
  perform pg_temp.chk('S1d invalid app_metadata role -> falls back to client_user', '^client_user/null$', v);

  -- S2 anonymous callers cannot run privileged functions
  foreach fn in array anon_calls loop
    perform pg_temp.chk('S2 anon: ' || left(fn, 60), '^ERR 42501', pg_temp.ex('anon', null, fn));
  end loop;
  perform pg_temp.chk('S2 anon: handle_new_user() cannot be called as a function', '^ERR (0A000|42501)', pg_temp.ex('anon', null, 'select public.handle_new_user()'));

  -- S3 signed-in callers without the right role
  perform pg_temp.chk('S3a client_admin cannot notify_users', '^ERR 42501', pg_temp.ex('authenticated', ca_, format('select public.notify_users(''client'', %L::uuid, ''t'', ''b'', ''/p'')', coA)));
  perform pg_temp.chk('S3b sales cannot notify_users', '^ERR 42501', pg_temp.ex('authenticated', sales_, format('select public.notify_users(''client'', %L::uuid, ''t'', ''b'', ''/p'')', coA)));
  perform pg_temp.chk('S3c client_admin cannot assign_order', '^ERR P0001 Not allowed to assign orders', pg_temp.ex('authenticated', ca_, format('select public.assign_order(%L::uuid, null, null, ''x'')', ord)));
  perform pg_temp.chk('S3d sales cannot assign_order', '^ERR P0001 Not allowed to assign orders', pg_temp.ex('authenticated', sales_, format('select public.assign_order(%L::uuid, null, null, ''x'')', ord)));
  perform pg_temp.chk('S3e signed-in user WITHOUT a profile cannot assign_order (the NULL-role bypass)', '^ERR P0001 Not allowed to assign orders', pg_temp.ex('authenticated', nobody, format('select public.assign_order(%L::uuid, null, null, ''x'')', ord)));
  perform pg_temp.chk('S3f operations CAN assign_order (control)', '^OK rows=1', pg_temp.ex('authenticated', ops_, format('select public.assign_order(%L::uuid, null, null, ''ZZ test'')', ord)));
  perform pg_temp.chk('S3g sales cannot recalc_order_cost', '^ERR P0001 Not permitted to change order costing', pg_temp.ex('authenticated', sales_, format('select public.recalc_order_cost(%L::uuid)', ord)));
  perform pg_temp.chk('S3h operations cannot recalc_order_cost', '^ERR P0001 Not permitted to change order costing', pg_temp.ex('authenticated', ops_, format('select public.recalc_order_cost(%L::uuid)', ord)));
  perform pg_temp.chk('S3i client cannot recalc_order_cost', '^ERR P0001 Not permitted to change order costing', pg_temp.ex('authenticated', ca_, format('select public.recalc_order_cost(%L::uuid)', ord)));
  perform pg_temp.chk('S3j admin CAN recalc_order_cost (control)', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('select public.recalc_order_cost(%L::uuid)', ord)));
  perform pg_temp.chk('S3k accounts CAN recalc_order_cost (control)', '^OK rows=1', pg_temp.ex('authenticated', acc_, format('select public.recalc_order_cost(%L::uuid)', ord)));
  perform pg_temp.chk('S3l client cannot provision a client user', '^ERR P0001 Not permitted to create client users', pg_temp.ex('authenticated', ca_, format('select public.provision_client_user(''a@b.test'', ''n'', ''pw12345678'', %L::uuid, ''client_user'')', coA)));
  perform pg_temp.chk('S3m client cannot write a campaign event for a campaign it cannot see', '^ERR P0001 Not permitted', pg_temp.ex('authenticated', ca_, 'select public.record_campaign_event(gen_random_uuid(), ''x'', ''{}'')'));
  perform pg_temp.chk('S3n profile-less signed-in user cannot write a campaign event', '^ERR P0001 Not permitted', pg_temp.ex('authenticated', nobody, 'select public.record_campaign_event(gen_random_uuid(), ''x'', ''{}'')'));
  perform pg_temp.chk('S3o staff passes the campaign-event check (fails only on the unknown campaign FK)', '^ERR 23503', pg_temp.ex('authenticated', sales_, 'select public.record_campaign_event(gen_random_uuid(), ''x'', ''{}'')'));

  -- S4 deactivated staff
  update public.profiles set is_active = false where id in (admin_, sales_);
  perform pg_temp.chk('S4a deactivated admin: is_admin()', '^false$', pg_temp.val('authenticated', admin_, 'select public.is_admin()::text'));
  perform pg_temp.chk('S4b deactivated admin: current_role()', '^NULL$', pg_temp.val('authenticated', admin_, 'select public.current_role()::text'));
  perform pg_temp.chk('S4c deactivated sales: can_sales()', '^false$', pg_temp.val('authenticated', sales_, 'select public.can_sales()::text'));
  perform pg_temp.chk('S4d deactivated admin cannot assign_order', '^ERR P0001 Not allowed to assign orders', pg_temp.ex('authenticated', admin_, format('select public.assign_order(%L::uuid, null, null, ''x'')', ord)));
  perform pg_temp.chk('S4e deactivated admin cannot recalc_order_cost', '^ERR P0001 Not permitted to change order costing', pg_temp.ex('authenticated', admin_, format('select public.recalc_order_cost(%L::uuid)', ord)));
  perform pg_temp.chk('S4f deactivated admin cannot change org settings (RLS: 0 rows)', '^OK rows=0', pg_temp.ex('authenticated', admin_, 'update public.org_settings set delivery_charge = 99'));
  perform pg_temp.chk('S4g deactivated admin cannot change role permissions', '^(OK rows=0|ERR 42501)', pg_temp.ex('authenticated', admin_, 'delete from public.role_permissions where permission_key = ''module.dashboard'' and role = ''sales'''));
  perform pg_temp.chk('S4h deactivated admin cannot transition a requirement', '^ERR P0001 Not permitted', pg_temp.ex('authenticated', admin_, 'select public.requirement_transition(gen_random_uuid(), ''admin_approved'')'));
  update public.profiles set is_active = true where id in (admin_, sales_);
  perform pg_temp.chk('S4i reactivated admin: is_admin() (control)', '^true$', pg_temp.val('authenticated', admin_, 'select public.is_admin()::text'));

  -- S5 cost protection on the data paths
  perform pg_temp.chk('S5a anon cannot read products.supplier_cost', '^ERR 42501', pg_temp.ex('anon', null, 'select supplier_cost from public.products limit 1'));
  perform pg_temp.chk('S5b anon cannot select * from products', '^ERR 42501', pg_temp.ex('anon', null, 'select * from public.products limit 1'));
  perform pg_temp.chk('S5c anon CAN read public product columns (control)', '^OK rows=1', pg_temp.ex('anon', null, 'select id, name, price, sku, sales_channel from public.products limit 1'));
  perform pg_temp.chk('S5d sales cannot read orders.product_cost', '^ERR 42501', pg_temp.ex('authenticated', sales_, 'select product_cost from public.orders'));
  perform pg_temp.chk('S5e sales cannot read orders.gross_profit', '^ERR 42501', pg_temp.ex('authenticated', sales_, 'select gross_profit from public.orders'));
  perform pg_temp.chk('S5f sales cannot select * from orders', '^ERR 42501', pg_temp.ex('authenticated', sales_, 'select * from public.orders'));
  perform pg_temp.chk('S5g sales CAN read orders.order_value (control)', '^OK', pg_temp.ex('authenticated', sales_, 'select order_value from public.orders'));
  perform pg_temp.chk('S5h client cannot read product_suppliers.supplier_cost', '^ERR 42501', pg_temp.ex('authenticated', ca_, 'select supplier_cost from public.product_suppliers'));
  perform pg_temp.chk('S5i client cannot read order_items.supplier_cost_snapshot', '^ERR 42501', pg_temp.ex('authenticated', ca_, 'select supplier_cost_snapshot from public.order_items'));
  perform pg_temp.chk('S5j client cannot read products.internal_notes', '^ERR 42501', pg_temp.ex('authenticated', ca_, 'select internal_notes from public.products'));
  perform pg_temp.chk('S5k operations cannot read products.internal_margin', '^ERR 42501', pg_temp.ex('authenticated', ops_, 'select internal_margin from public.products'));
  perform pg_temp.chk('S5l even admin cannot read products.supplier_cost directly (must use the checked function)', '^ERR 42501', pg_temp.ex('authenticated', admin_, 'select supplier_cost from public.products'));
  perform pg_temp.chk('S5m sales cannot call order_cost_summary', '^ERR P0001 Not permitted to view order costs', pg_temp.ex('authenticated', sales_, format('select * from public.order_cost_summary(array[%L::uuid])', ord)));
  perform pg_temp.chk('S5n operations cannot call product_cost_summary', '^ERR P0001 Not permitted to view product costs', pg_temp.ex('authenticated', ops_, format('select * from public.product_cost_summary(array[%L::uuid])', prod)));
  perform pg_temp.chk('S5o client cannot call order_cost_summary', '^ERR P0001 Not permitted to view order costs', pg_temp.ex('authenticated', ca_, format('select * from public.order_cost_summary(array[%L::uuid])', ord)));
  perform pg_temp.chk('S5p admin CAN call order_cost_summary (control)', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('select * from public.order_cost_summary(array[%L::uuid])', ord)));
  perform pg_temp.chk('S5q accounts CAN call order_cost_summary (control)', '^OK rows=1', pg_temp.ex('authenticated', acc_, format('select * from public.order_cost_summary(array[%L::uuid])', ord)));
  perform pg_temp.chk('S5r management CAN call order_cost_summary (control)', '^OK rows=1', pg_temp.ex('authenticated', mgmt_, format('select * from public.order_cost_summary(array[%L::uuid])', ord)));
  perform pg_temp.chk('S5s admin CAN call product_cost_summary (control)', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('select * from public.product_cost_summary(array[%L::uuid])', prod)));
  perform pg_temp.chk('S5t operations CAN read supplier costs (holds suppliers.cost_view)', '^OK', pg_temp.ex('authenticated', ops_, format('select * from public.order_item_supplier_costs(%L::uuid)', ord)));
  perform pg_temp.chk('S5u sales cannot read order-line supplier costs', '^ERR P0001 Not permitted to view supplier costs', pg_temp.ex('authenticated', sales_, format('select * from public.order_item_supplier_costs(%L::uuid)', ord)));
  perform pg_temp.chk('S5v client cannot read order-line supplier costs', '^ERR P0001 Not permitted to view supplier costs', pg_temp.ex('authenticated', ca_, format('select * from public.order_item_supplier_costs(%L::uuid)', ord)));
  perform pg_temp.chk('S5w client cannot read product-supplier costs', '^ERR P0001 Not permitted to view supplier costs', pg_temp.ex('authenticated', ca_, 'select * from public.product_supplier_costs(array[gen_random_uuid()])'));

  -- S6 audit log
  perform pg_temp.chk('S6a sales sees none of its own cost-bearing audit rows', '^0$', pg_temp.val('authenticated', sales_, 'select count(*)::text from public.audit_logs where entity in (''products'',''orders'',''order_items'',''product_suppliers'')'));
  perform pg_temp.chk('S6b client sees no audit rows', '^0$', pg_temp.val('authenticated', ca_, 'select count(*)::text from public.audit_logs'));
  perform pg_temp.chk('S6c anon sees no audit rows', '^0$', pg_temp.val('anon', null, 'select count(*)::text from public.audit_logs'));
  perform pg_temp.chk('S6d admin still reads the audit log (control)', '^[1-9]', pg_temp.val('authenticated', admin_, 'select count(*)::text from public.audit_logs'));
  perform pg_temp.chk('S6e management still reads the audit log (control)', '^[1-9]', pg_temp.val('authenticated', mgmt_, 'select count(*)::text from public.audit_logs'));
  perform pg_temp.chk('S6f client cannot insert an audit row', '^ERR 42501', pg_temp.ex('authenticated', ca_, 'insert into public.audit_logs(action, entity) values (''x'',''y'')'));
  perform pg_temp.chk('S6g sales cannot forge an audit row as another user', '^ERR 42501', pg_temp.ex('authenticated', sales_, format('insert into public.audit_logs(user_id, action, entity) values (%L::uuid, ''x'', ''y'')', admin_)));
  perform pg_temp.chk('S6h admin updates a product cost and note (control)', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('update public.products set supplier_cost = 12.5, internal_margin = 3, internal_notes = ''zz secret'' where id = %L::uuid', prod)));
  select (new_value ? 'supplier_cost')::text||','||(new_value ? 'internal_notes')::text||','||(new_value ? 'internal_margin')::text||','||(new_value ? 'restricted_fields_changed')::text||','||(previous_value ? 'supplier_cost')::text into v
    from public.audit_logs where entity = 'products' and entity_id = prod and created_at = now() order by id desc limit 1;
  perform pg_temp.chk('S6i the NEW audit row holds no cost, margin or note, only their names', '^false,false,false,true,false$', v);
  perform pg_temp.chk('S6j that audit row does not contain 12.5 or the secret note anywhere', '^0$', (select count(*)::text from public.audit_logs where entity = 'products' and entity_id = prod and created_at = now() and (new_value::text like '%12.5%' or new_value::text like '%zz secret%' or previous_value::text like '%zz secret%')));
  perform pg_temp.chk('S6k admin updates an order cost (control)', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('update public.orders set printing_cost = 77.77 where id = %L::uuid', ord)));
  perform pg_temp.chk('S6l every NEW order audit row of this transaction (>= 1; the earlier controls also write some) holds no cost figure and is marked redacted', '^[1-9][0-9]*\|0\|true$', (select count(*)::text||'|'||count(*) filter (where new_value::text like '%77.77%' or new_value ? 'printing_cost' or new_value ? 'gross_profit' or previous_value ? 'printing_cost')::text||'|'||bool_and(new_value ? 'restricted_fields_changed')::text from public.audit_logs where entity = 'orders' and entity_id = ord and created_at = now()));

  -- S7 notifications
  insert into public.notifications(audience, company_id, title, body, link) values ('client', coA, 'ZZ A', 'b', '/portal'), ('client', coB, 'ZZ B', 'b', '/portal');
  perform pg_temp.chk('S7a client cannot insert a notification', '^ERR 42501', pg_temp.ex('authenticated', ca_, format('insert into public.notifications(audience, company_id, title) values (''client'', %L::uuid, ''pwn'')', coA)));
  perform pg_temp.chk('S7b anon cannot insert a notification', '^ERR 42501', pg_temp.ex('anon', null, format('insert into public.notifications(audience, company_id, title) values (''client'', %L::uuid, ''pwn'')', coA)));
  perform pg_temp.chk('S7c client cannot rewrite a notification title', '^ERR 42501', pg_temp.ex('authenticated', ca_, 'update public.notifications set title = ''pwn'''));
  perform pg_temp.chk('S7d client cannot rewrite a notification link', '^ERR 42501', pg_temp.ex('authenticated', ca_, 'update public.notifications set link = ''https://evil.example'''));
  perform pg_temp.chk('S7e client marks ONLY its own company''s notification read (1 row)', '^OK rows=1$', pg_temp.ex('authenticated', ca_, 'update public.notifications set read_at = now() where title like ''ZZ %'''));
  perform pg_temp.chk('S7f internal staff can insert an internal notification (control)', '^OK rows=1', pg_temp.ex('authenticated', sales_, 'insert into public.notifications(audience, title) values (''internal'', ''ZZ staff'')'));
  perform pg_temp.chk('S7g client does not see company B''s notification', '^1$', pg_temp.val('authenticated', ca_, 'select count(*)::text from public.notifications where title like ''ZZ %'''));

  raise exception 'RESULTS %', pg_temp.summary();
end
$t$;
