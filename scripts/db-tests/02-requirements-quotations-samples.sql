-- REAL-DATABASE TEST 02: requirement isolation and workflow, quotation preparation / decisions / expiry / isolation,
-- sample stock atomicity, rate limiter. 83 checks (W1, W2, W3, W4, W8, W9).
--
-- HOW TO RUN: paste the whole file into the Supabase SQL Editor of project zrfetfibatcuvwogyvjn and run it once.
-- Impersonates real roles with EXISTING accounts, writes only inside one transaction and ends with a DELIBERATE error
-- "RESULTS {...}" so everything is rolled back. Read the JSON: "failed": [] and "passed" == "total" means all passed.
-- Uses two client companies (c1000000-...-0010 / -0011) and their client_admin accounts; update the ids if they change.

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
  ca_    uuid := '66666666-6666-4666-8666-666666666666';
  cb_    uuid := '77777777-7777-4777-8777-777777777777';
  coA uuid := 'c1000000-0000-4000-8000-000000000010';
  coB uuid := 'c1000000-0000-4000-8000-000000000011';
  pa uuid := (select id from public.products order by sku limit 1);
  pb uuid := (select id from public.products order by sku desc limit 1);
  ra uuid := gen_random_uuid(); rb uuid := gen_random_uuid();
  q uuid; q2 uuid; it1 uuid; it2 uuid; it3 uuid; v text;
begin
  insert into public.requirements(id, name, company_id, owner_id, workflow_stage, quantity, budget, submitted_at)
  values (ra, 'ZZ-REQ-A', coA, sales_, 'submitted', 100, 500000, now()), (rb, 'ZZ-REQ-B', coB, sales_, 'submitted', 50, 100000, now());

  begin
    perform pg_temp.chk('W1a client A sees only its own requirement', '^1$', pg_temp.val('authenticated', ca_, 'select count(*)::text from public.requirements where name like ''ZZ-REQ-%'''));
    perform pg_temp.chk('W1b client B sees only its own requirement', '^1$', pg_temp.val('authenticated', cb_, 'select count(*)::text from public.requirements where name like ''ZZ-REQ-%'''));
    perform pg_temp.chk('W1c anon sees no requirement', '^0$', pg_temp.val('anon', null, 'select count(*)::text from public.requirements where name like ''ZZ-REQ-%'''));
    perform pg_temp.chk('W1d operations cannot read requirements', '^0$', pg_temp.val('authenticated', ops_, 'select count(*)::text from public.requirements where name like ''ZZ-REQ-%'''));
    perform pg_temp.chk('W1e owning sales user sees both', '^2$', pg_temp.val('authenticated', sales_, 'select count(*)::text from public.requirements where name like ''ZZ-REQ-%'''));
    perform pg_temp.chk('W1f client B cannot read the events of company A''s requirement', '^0$', pg_temp.val('authenticated', cb_, 'select count(*)::text from public.requirement_events'));
  exception when others then perform pg_temp.chk('SECTION ERROR W1', '^$', sqlerrm); end;

  begin
    perform pg_temp.chk('W2a client cannot jump submitted -> selection_approved', '^ERR P0001 This requirement cannot move from submitted to selection_approved', pg_temp.val('authenticated', ca_, format('select public.requirement_transition(%L::uuid, ''selection_approved'')', ra)));
    perform pg_temp.chk('W2b client B cannot touch company A''s requirement', '^ERR P0001 Requirement not found', pg_temp.val('authenticated', cb_, format('select public.requirement_transition(%L::uuid, ''client_confirmed'')', ra)));
    perform pg_temp.chk('W2c operations cannot review requirements', '^ERR P0001 Your role cannot review requirements', pg_temp.val('authenticated', ops_, format('select public.requirement_transition(%L::uuid, ''admin_approved'')', ra)));
    perform pg_temp.chk('W2d admin cannot confirm on the client''s behalf', '^ERR P0001 This requirement cannot move from submitted to client_confirmed', pg_temp.val('authenticated', admin_, format('select public.requirement_transition(%L::uuid, ''client_confirmed'')', ra)));
    perform pg_temp.chk('W2e rejection needs a note', '^ERR P0001 Please add a note', pg_temp.val('authenticated', admin_, format('select public.requirement_transition(%L::uuid, ''admin_rejected'')', ra)));
    perform pg_temp.chk('W2f admin cannot write the stage column directly (guard trigger)', '^ERR P0001 Workflow fields change only through the requirement workflow', pg_temp.ex('authenticated', admin_, format('update public.requirements set workflow_stage = ''selection_approved'' where id = %L::uuid', ra)));
    perform pg_temp.chk('W2g owning sales cannot write the stage column directly', '^ERR P0001 Workflow fields change only', pg_temp.ex('authenticated', sales_, format('update public.requirements set workflow_stage = ''selection_approved'' where id = %L::uuid', ra)));
    perform pg_temp.chk('W2h client cannot update a requirement at all (0 rows)', '^OK rows=0', pg_temp.ex('authenticated', ca_, format('update public.requirements set workflow_stage = ''selection_approved'', budget = 1 where id = %L::uuid', ra)));
    perform pg_temp.chk('W2i anon cannot update a requirement', '^(OK rows=0|ERR 42501)', pg_temp.ex('anon', null, format('update public.requirements set budget = 1 where id = %L::uuid', ra)));
    perform pg_temp.chk('W2j admin cannot move a requirement to another company', '^ERR P0001 Workflow fields change only', pg_temp.ex('authenticated', admin_, format('update public.requirements set company_id = %L::uuid where id = %L::uuid', coB, ra)));
    perform pg_temp.chk('W2k stage unchanged after all refused attempts', '^submitted$', (select workflow_stage from public.requirements where id = ra));
  exception when others then perform pg_temp.chk('SECTION ERROR W2', '^$', sqlerrm); end;

  begin
    perform pg_temp.chk('W3a admin approves', '^admin_approved$', pg_temp.val('authenticated', admin_, format('select public.requirement_transition(%L::uuid, ''admin_approved'', ''Approved'', true)', ra)));
    perform pg_temp.chk('W3b client A confirms', '^client_confirmed$', pg_temp.val('authenticated', ca_, format('select public.requirement_transition(%L::uuid, ''client_confirmed'')', ra)));
    perform pg_temp.chk('W3c selection with no products is refused', '^ERR P0001 Add at least one product', pg_temp.val('authenticated', ca_, format('select public.requirement_transition(%L::uuid, ''selection_submitted'')', ra)));
    insert into public.requirement_products(requirement_id, product_id, quantity) values (ra, pa, 2), (ra, pb, 3);
    perform pg_temp.chk('W3d client A submits its selection', '^selection_submitted$', pg_temp.val('authenticated', ca_, format('select public.requirement_transition(%L::uuid, ''selection_submitted'')', ra)));
    perform pg_temp.chk('W3e double click returns the same stage (idempotent)', '^selection_submitted$', pg_temp.val('authenticated', ca_, format('select public.requirement_transition(%L::uuid, ''selection_submitted'')', ra)));
    perform pg_temp.chk('W3f budget/quantity are frozen after approval', '^ERR P0001 The approved budget and quantity cannot be edited', pg_temp.ex('authenticated', admin_, format('update public.requirements set budget = 1 where id = %L::uuid', ra)));
    perform pg_temp.chk('W3g admin approves the selection', '^selection_approved$', pg_temp.val('authenticated', admin_, format('select public.requirement_transition(%L::uuid, ''selection_approved'', ''Go'', true)', ra)));
    perform pg_temp.chk('W3h client B sees no events and no products of company A', '^0$', pg_temp.val('authenticated', cb_, format('select ((select count(*) from public.requirement_events) + (select count(*) from public.requirement_products where requirement_id = %L::uuid))::text', ra)));
    perform pg_temp.chk('W3i staff internal note is saved', '^OK', pg_temp.ex('authenticated', admin_, format('select public.requirement_add_internal_note(%L::uuid, ''ZZ internal only'')', ra)));
    perform pg_temp.chk('W3j client A cannot see the internal note', '^0$', pg_temp.val('authenticated', ca_, 'select count(*)::text from public.requirement_events where note like ''ZZ internal%'''));
    perform pg_temp.chk('W3k client A sees exactly its 4 visible history events (approve, confirm, submit selection, approve selection; the internal note is hidden)', '^4$', pg_temp.val('authenticated', ca_, 'select count(*)::text from public.requirement_events'));
    perform pg_temp.chk('W3l client cannot write an internal note', '^ERR (42501|P0001 Not permitted)', pg_temp.ex('authenticated', ca_, format('select public.requirement_add_internal_note(%L::uuid, ''x'')', ra)));
    perform pg_temp.chk('W3m client sees the selection lines of its own requirement (2)', '^2$', pg_temp.val('authenticated', ca_, format('select count(*)::text from public.requirement_products where requirement_id = %L::uuid', ra)));
  exception when others then perform pg_temp.chk('SECTION ERROR W3', '^$', sqlerrm); end;

  begin
    perform pg_temp.chk('W4a no quotation before the selection is approved (requirement B is still "submitted")', '^ERR P0001 A quotation can only be prepared', pg_temp.ex('authenticated', admin_, format('insert into public.quotations(quotation_number, company_id, requirement_id, owner_id, status) values (''ZZ-QX'', %L::uuid, %L::uuid, %L::uuid, ''draft'')', coB, rb, admin_)));
    perform pg_temp.chk('W4b admin prepares the draft quotation for the approved selection', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('insert into public.quotations(quotation_number, company_id, requirement_id, owner_id, valid_until, status, discount_percent, tax_percent) values (''ZZ-Q1'', %L::uuid, %L::uuid, %L::uuid, current_date + 10, ''draft'', 0, 18)', coA, ra, admin_)));
    select id into q from public.quotations where quotation_number = 'ZZ-Q1';
    perform pg_temp.chk('W4c requirement moved to quotation_drafted automatically', '^quotation_drafted$', (select workflow_stage from public.requirements where id = ra));
    perform pg_temp.chk('W4d a second draft for the same requirement is refused (unique)', '^ERR 23505', pg_temp.ex('authenticated', admin_, format('insert into public.quotations(quotation_number, company_id, requirement_id, owner_id, status) values (''ZZ-Q1b'', %L::uuid, %L::uuid, %L::uuid, ''draft'')', coA, ra, admin_)));
    perform pg_temp.chk('W4e admin adds two lines', '^OK rows=2', pg_temp.ex('authenticated', admin_, format('insert into public.quotation_items(quotation_id, product_id, quantity, unit_price) values (%L::uuid, %L::uuid, 2, 100), (%L::uuid, %L::uuid, 3, 200)', q, pa, q, pb)));
    perform pg_temp.chk('W4e2 admin may run recalc_quotation_totals', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('select public.recalc_quotation_totals(%L::uuid)', q)));
    perform pg_temp.chk('W4f totals: 800 + 18% tax = 944.00', '^944\.00$', (select total::text from public.quotations where id = q));
    perform pg_temp.chk('W4g admin sends the quotation', '^OK rows=1', pg_temp.ex('authenticated', admin_, format('update public.quotations set status = ''sent'' where id = %L::uuid', q)));
    perform pg_temp.chk('W4h requirement follows: quotation_sent / quoted', '^quotation_sent/quoted$', (select workflow_stage||'/'||status::text from public.requirements where id = ra));
    perform pg_temp.chk('W4i client B cannot see company A''s quotation', '^0$', pg_temp.val('authenticated', cb_, 'select count(*)::text from public.quotations where quotation_number = ''ZZ-Q1'''));
    perform pg_temp.chk('W4j client B cannot see company A''s quotation lines', '^0$', pg_temp.val('authenticated', cb_, format('select count(*)::text from public.quotation_items where quotation_id = %L::uuid', q)));
    perform pg_temp.chk('W4k client B cannot read them through quotation_accepted_items() either (the migration 33 exposure)', '^0$', pg_temp.val('authenticated', cb_, format('select count(*)::text from public.quotation_accepted_items(%L::uuid)', q)));
    perform pg_temp.chk('W4l client A reads its own lines through the function (2)', '^2$', pg_temp.val('authenticated', ca_, format('select count(*)::text from public.quotation_accepted_items(%L::uuid)', q)));
    perform pg_temp.chk('W4m anon cannot call quotation_accepted_items', '^ERR 42501', pg_temp.val('anon', null, format('select count(*)::text from public.quotation_accepted_items(%L::uuid)', q)));
    perform pg_temp.chk('W4n client B cannot answer company A''s quotation', '^ERR P0001 Quotation not found', pg_temp.val('authenticated', cb_, format('select public.client_respond_quotation_items(%L::uuid, ''[]''::jsonb, ''x'')::text', q)));
    perform pg_temp.chk('W4o staff cannot answer on the client''s behalf', '^ERR P0001 Not permitted', pg_temp.val('authenticated', admin_, format('select public.client_respond_quotation(%L::uuid, true, ''x'')::text', q)));
    select id into it1 from public.quotation_items where quotation_id = q and product_id = pa;
    select id into it2 from public.quotation_items where quotation_id = q and product_id = pb;
    perform pg_temp.chk('W4p decisions must cover every line exactly once', '^ERR P0001 Please accept or reject every item exactly once', pg_temp.val('authenticated', ca_, format('select public.client_respond_quotation_items(%L::uuid, jsonb_build_array(jsonb_build_object(''item_id'', %L, ''accept'', true)), ''x'')::text', q, it1::text)));
    perform pg_temp.chk('W4q a foreign line id is refused', '^ERR P0001 (One of the items does not belong|Please accept or reject every item exactly once)', pg_temp.val('authenticated', ca_, format('select public.client_respond_quotation_items(%L::uuid, jsonb_build_array(jsonb_build_object(''item_id'', %L, ''accept'', true), jsonb_build_object(''item_id'', gen_random_uuid()::text, ''accept'', true)), ''x'')::text', q, it1::text)));
    perform pg_temp.chk('W4r client A accepts line 1 and rejects line 2', '^OK', pg_temp.ex('authenticated', ca_, format('select public.client_respond_quotation_items(%L::uuid, jsonb_build_array(jsonb_build_object(''item_id'', %L, ''accept'', true), jsonb_build_object(''item_id'', %L, ''accept'', false)), ''ZZ partial'')', q, it1::text, it2::text)));
    perform pg_temp.chk('W4s quotation accepted, requirement quotation_accepted/won', '^accepted\|quotation_accepted/won$', (select qs.status::text||'|'||r.workflow_stage||'/'||r.status::text from public.quotations qs join public.requirements r on r.id = qs.requirement_id where qs.id = q));
    perform pg_temp.chk('W4t a second answer is refused', '^ERR P0001 This quotation can no longer be answered', pg_temp.val('authenticated', ca_, format('select public.client_respond_quotation_items(%L::uuid, jsonb_build_array(jsonb_build_object(''item_id'', %L, ''accept'', true), jsonb_build_object(''item_id'', %L, ''accept'', true)), ''x'')::text', q, it1::text, it2::text)));
    perform pg_temp.chk('W4u accepted total = line 1 only + tax = 236.00', '^236\.00$', pg_temp.val('authenticated', admin_, format('select public.quotation_accepted_total(%L::uuid)::text', q)));
    perform pg_temp.chk('W4v only the accepted line counts (1)', '^1$', pg_temp.val('authenticated', admin_, format('select count(*)::text from public.quotation_accepted_items(%L::uuid)', q)));
    perform pg_temp.chk('W4w item decisions are stored (accepted,rejected)', '^accepted,rejected$', (select string_agg(client_decision, ',' order by client_decision) from public.quotation_items where quotation_id = q));
    insert into public.quotations(id, quotation_number, company_id, owner_id, status, valid_until) values (gen_random_uuid(), 'ZZ-Q2', coA, admin_, 'sent', current_date - 1) returning id into q2;
    insert into public.quotation_items(quotation_id, product_id, quantity, unit_price) values (q2, pa, 1, 50) returning id into it3;
    perform pg_temp.chk('W4x expired quotation cannot be accepted item by item', '^ERR P0001 This quotation has expired', pg_temp.val('authenticated', ca_, format('select public.client_respond_quotation_items(%L::uuid, jsonb_build_array(jsonb_build_object(''item_id'', %L, ''accept'', true)), ''x'')::text', q2, it3::text)));
    perform pg_temp.chk('W4y expired quotation cannot be accepted as a whole', '^ERR P0001 This quotation has expired', pg_temp.val('authenticated', ca_, format('select public.client_respond_quotation(%L::uuid, true, ''x'')::text', q2)));
    perform pg_temp.chk('W4z expired quotation stays unanswered', '^sent$', (select status::text from public.quotations where id = q2));
  exception when others then perform pg_temp.chk('SECTION ERROR W4', '^$', sqlerrm); end;

  begin
    perform pg_temp.chk('W8a client cannot receive samples', '^ERR P0001 Not permitted', pg_temp.ex('authenticated', ca_, format('select public.receive_sample(%L::uuid, 1)', pa)));
    perform pg_temp.chk('W8b accounts cannot move samples', '^ERR P0001 Not permitted', pg_temp.ex('authenticated', acc_, format('select public.move_sample(%L::uuid, 1, ''office'', ''client'')', pa)));
    perform pg_temp.chk('W8c operations receives 5 into the office', '^OK rows=1', pg_temp.ex('authenticated', ops_, format('select public.receive_sample(%L::uuid, 5, 0, ''ZZ'')', pa)));
    perform pg_temp.chk('W8d office -> client 2', '^OK rows=1', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 2, ''office'', ''client'')', pa)));
    perform pg_temp.chk('W8e moving 10 from the office (3 left) is refused', '^ERR P0001 Not enough samples in office', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 10, ''office'', ''client'')', pa)));
    perform pg_temp.chk('W8f office -> team works (failed before migration 34)', '^OK rows=1', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 1, ''office'', ''team'')', pa)));
    perform pg_temp.chk('W8g team -> office back', '^OK rows=1', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 1, ''team'', ''office'')', pa)));
    perform pg_temp.chk('W8h team -> client with nothing on the team is refused', '^ERR P0001 Not enough samples with the team', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 1, ''team'', ''client'')', pa)));
    perform pg_temp.chk('W8i same location refused', '^ERR P0001 Invalid sample location', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 1, ''office'', ''office'')', pa)));
    perform pg_temp.chk('W8j unknown location refused', '^ERR P0001 Invalid sample location', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 1, ''office'', ''moon'')', pa)));
    perform pg_temp.chk('W8k zero quantity refused', '^ERR P0001 Quantity must be positive', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 0, ''office'', ''client'')', pa)));
    perform pg_temp.chk('W8l sales may move samples (control)', '^OK rows=1', pg_temp.ex('authenticated', sales_, format('select public.move_sample(%L::uuid, 1, ''office'', ''client'')', pa)));
    select in_office::text||','||with_client::text||','||with_team::text into v from public.sample_stock where product_id = pa;
    perform pg_temp.chk('W8m stock before the failing move: office 2, client 3, team 0', '^2,3,0$', v);
    perform pg_temp.chk('W8n a move whose ledger row fails (unknown company) is refused', '^ERR 23503', pg_temp.ex('authenticated', ops_, format('select public.move_sample(%L::uuid, 1, ''office'', ''client'', gen_random_uuid())', pa)));
    select in_office::text||','||with_client::text||','||with_team::text into v from public.sample_stock where product_id = pa;
    perform pg_temp.chk('W8o ATOMIC: the stock change was rolled back with the failed ledger row (still 2,3,0)', '^2,3,0$', v);
    perform pg_temp.chk('W8p ledger has exactly the 5 successful movements', '^5$', (select count(*)::text from public.sample_movements where product_id = pa));
    perform pg_temp.chk('W8q no negative stock anywhere', '^0$', (select count(*)::text from public.sample_stock where in_office < 0 or with_client < 0 or pending_supplier < 0 or with_team < 0));
  exception when others then perform pg_temp.chk('SECTION ERROR W8', '^$', sqlerrm); end;

  begin
    perform pg_temp.chk('W9a rate limit: 1st call allowed', '^true$', public.rate_limit_check('zz-bucket', 'k1', 2, 60)::text);
    perform pg_temp.chk('W9b 2nd call allowed', '^true$', public.rate_limit_check('zz-bucket', 'k1', 2, 60)::text);
    perform pg_temp.chk('W9c 3rd call in the window refused', '^false$', public.rate_limit_check('zz-bucket', 'k1', 2, 60)::text);
    perform pg_temp.chk('W9d another key is independent', '^true$', public.rate_limit_check('zz-bucket', 'k2', 2, 60)::text);
    perform pg_temp.chk('W9e another bucket is independent', '^true$', public.rate_limit_check('zz-other', 'k1', 2, 60)::text);
    perform pg_temp.chk('W9f invalid arguments are rejected', '^ERR P0001 Invalid rate limit arguments', pg_temp.ex('postgres', null, 'select public.rate_limit_check(''x'', ''y'', 0, 60)'));
    perform pg_temp.chk('W9g service_role may call it', '^OK rows=1', pg_temp.ex('service_role', null, 'select public.rate_limit_check(''zz-svc'', ''k'', 5, 60)'));
    perform pg_temp.chk('W9h counters are stored in the table (4 rows for k1 x2, k2, other)', '^4$', (select count(*)::text from public.rate_limit_events where bucket in ('zz-bucket','zz-other')));
    perform pg_temp.chk('W9i signed-in users cannot read the counters', '^ERR 42501', pg_temp.ex('authenticated', admin_, 'select * from public.rate_limit_events'));
  exception when others then perform pg_temp.chk('SECTION ERROR W9', '^$', sqlerrm); end;

  raise exception 'RESULTS %', pg_temp.summary();
end
$t$;
