-- LOCAL ONLY. Run after migrations in a disposable local Supabase database.
-- Fixtures and all requests are rolled back at the end of this test.
begin;
select plan(1);

insert into auth.users (id, email) values
  ('11111111-aaaa-4aaa-8aaa-111111111111', 'catalog-request-owner-a@example.test'),
  ('22222222-bbbb-4bbb-8bbb-222222222222', 'catalog-request-owner-b@example.test'),
  ('33333333-cccc-4ccc-8ccc-333333333333', 'catalog-request-owner-c@example.test');

insert into public.arpe_businesses (id, owner_id, name, catalog_slug, public_catalog_enabled)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-aaaa-4aaa-8aaa-111111111111', 'Business A', 'catalog-request-a', true),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-bbbb-4bbb-8bbb-222222222222', 'Business B', 'catalog-request-b', true),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-cccc-4ccc-8ccc-333333333333', 'Business C', 'catalog-request-disabled', false);

insert into public.arpe_catalog_products (
  id, business_id, name, category, unit_label, default_unit_price, default_portions,
  is_active, is_public, public_price_mode
)
values
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Pastel Exacto', 'Pasteles', 'unidad', 850, 12, true, true, 'exact'),
  ('aaaaaaaa-0001-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Caja Desde', 'Empaques', 'caja', 80, null, true, true, 'from'),
  ('aaaaaaaa-0001-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Decoración Consultar', 'Decoración', 'servicio', 150, null, true, true, 'contact'),
  ('aaaaaaaa-0001-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Producto Privado', 'Pasteles', 'unidad', 900, 12, true, false, 'exact'),
  ('aaaaaaaa-0001-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Producto Inactivo', 'Pasteles', 'unidad', 900, 12, false, true, 'exact'),
  ('bbbbbbbb-0001-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Producto de B', 'Pasteles', 'unidad', 1200, 16, true, true, 'exact');

do $$
declare
  v_function oid := 'public.ejnexa_submit_catalog_request(text,uuid,text,text,date,text,jsonb)'::regprocedure;
  v_request record;
  v_json jsonb;
  v_year integer := extract(year from now())::integer;
  v_first_key uuid := 'dddddddd-0001-4000-8000-000000000001';
  v_second_key uuid := 'dddddddd-0001-4000-8000-000000000002';
  v_items jsonb;
  v_unknown_error text;
  v_disabled_error text;
begin
  if not has_function_privilege('anon', v_function, 'EXECUTE')
     or not has_function_privilege('authenticated', v_function, 'EXECUTE') then
    raise exception 'Anon/authenticated EXECUTE grant is missing';
  end if;
  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = v_function
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC still has EXECUTE on the intake RPC';
  end if;
  if not (select p.prosecdef from pg_proc p where p.oid = v_function) then
    raise exception 'Intake RPC is not SECURITY DEFINER';
  end if;
  if not exists (
    select 1 from pg_proc p
    cross join lateral unnest(p.proconfig) cfg
    where p.oid = v_function
      and cfg like 'search_path=%'
      and replace(cfg, ' ', '') in ('search_path=""', 'search_path=')
  ) then
    raise exception 'Intake RPC does not pin an empty search_path';
  end if;

  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.arpe_catalog_requests'::regclass)
     or not (select c.relrowsecurity from pg_class c where c.oid = 'public.arpe_catalog_request_items'::regclass)
     or not (select c.relrowsecurity from pg_class c where c.oid = 'private.arpe_catalog_request_sequences'::regclass) then
    raise exception 'RLS is not enabled on all intake tables';
  end if;

  if has_table_privilege('anon', 'public.arpe_catalog_requests', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'public.arpe_catalog_request_items', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Anon has direct table privileges';
  end if;
  if not has_table_privilege('authenticated', 'public.arpe_catalog_requests', 'SELECT')
     or not has_table_privilege('authenticated', 'public.arpe_catalog_request_items', 'SELECT')
     or has_table_privilege('authenticated', 'public.arpe_catalog_requests', 'INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.arpe_catalog_request_items', 'INSERT,UPDATE,DELETE') then
    raise exception 'Authenticated table privileges are not read-only';
  end if;
  if has_schema_privilege('anon', 'private', 'USAGE')
     or has_schema_privilege('authenticated', 'private', 'USAGE')
     or has_table_privilege('anon', 'private.arpe_catalog_request_sequences', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'private.arpe_catalog_request_sequences', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Private request sequence is exposed';
  end if;
end $$;

set local role anon;
do $$
declare
  v_request record;
  v_json jsonb;
  v_year integer := extract(year from now())::integer;
  v_first_key uuid := 'dddddddd-0001-4000-8000-000000000001';
  v_second_key uuid := 'dddddddd-0001-4000-8000-000000000002';
  v_items jsonb;
begin
  v_items := jsonb_build_array(
    jsonb_build_object(
      'product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 2,
      'name', 'HACK', 'price', 1, 'business_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'owner_id', '22222222-bbbb-4bbb-8bbb-222222222222', 'status', 'converted'
    ),
    jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000002', 'quantity', 3),
    jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000003', 'quantity', 1)
  );

  -- An anonymous caller can submit once through the RPC and only receives the allowlisted fields.
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform 1 from public.arpe_catalog_requests;
    raise exception 'TEST_FAILED: anon read requests directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.arpe_catalog_requests (business_id, request_number, client_request_key, customer_name)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SOL-2026-9999', gen_random_uuid(), 'Direct insert');
    raise exception 'TEST_FAILED: anon inserted requests directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.arpe_catalog_requests set status = 'archived';
    raise exception 'TEST_FAILED: anon updated requests directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.arpe_catalog_requests;
    raise exception 'TEST_FAILED: anon deleted requests directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.arpe_catalog_request_items;
    raise exception 'TEST_FAILED: anon read request items directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.arpe_catalog_request_items (request_id, business_id, catalog_product_id, position, product_name_snapshot, category_snapshot, quantity, unit_label_snapshot, public_price_mode_snapshot, public_unit_price_snapshot)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0001-4000-8000-000000000001', 1, 'Direct', 'Test', 1, 'unidad', 'exact', 1);
    raise exception 'TEST_FAILED: anon inserted request items directly';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.arpe_catalog_request_items set quantity = 2;
    raise exception 'TEST_FAILED: anon updated request items directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.arpe_catalog_request_items;
    raise exception 'TEST_FAILED: anon deleted request items directly';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from private.arpe_catalog_request_sequences;
    raise exception 'TEST_FAILED: anon read private sequences';
  exception when insufficient_privilege then null;
  end;

  select * into v_request
  from public.ejnexa_submit_catalog_request(
    'catalog-request-a', v_first_key, '  María Cliente  ', null, current_date + 1, '  detalles  ', v_items
  );
  if v_request.id is null or v_request.status <> 'new'
     or v_request.request_number <> 'SOL-' || v_year::text || '-0001' then
    raise exception 'Valid request did not return the expected first request';
  end if;
  v_json := to_jsonb(v_request);
  if (select array_agg(k order by k) from jsonb_object_keys(v_json) as keys(k))
     <> array['id', 'request_number', 'status', 'submitted_at'] then
    raise exception 'RPC return contains fields outside the response allowlist';
  end if;
  perform set_config('test.catalog_request_a1_id', v_request.id::text, true);
  perform set_config('test.catalog_request_a1_number', v_request.request_number, true);

  -- Replaying the key returns the original row and does not trust or persist a changed payload.
  select * into v_request
  from public.ejnexa_submit_catalog_request(
    'catalog-request-a', v_first_key, null, null, null, null, null
  );
  if v_request.id::text <> current_setting('test.catalog_request_a1_id')
     or v_request.request_number <> current_setting('test.catalog_request_a1_number') then
    raise exception 'Idempotent replay did not return the original request';
  end if;

  select * into v_request
  from public.ejnexa_submit_catalog_request(
    'catalog-request-a', v_second_key, 'Customer Two', repeat('5', 30), current_date, '',
    jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 9999))
  );
  if v_request.request_number <> 'SOL-' || v_year::text || '-0002' then
    raise exception 'Second request number for Business A is incorrect';
  end if;
  perform set_config('test.catalog_request_a2_id', v_request.id::text, true);

  -- Idempotency keys are scoped to a business; Business B has its own first sequence number.
  select * into v_request
  from public.ejnexa_submit_catalog_request(
    'catalog-request-b', v_first_key, 'Customer B', '', null, null,
    jsonb_build_array(jsonb_build_object('product_id', 'bbbbbbbb-0001-4000-8000-000000000001', 'quantity', 1))
  );
  if v_request.request_number <> 'SOL-' || v_year::text || '-0001' then
    raise exception 'Business B did not receive its own first request number';
  end if;
  perform set_config('test.catalog_request_b1_id', v_request.id::text, true);
end $$;
reset role;

  -- Disabled and unknown catalog slugs expose the same generic error.
set local role anon;
do $$
declare
  v_unknown_error text;
  v_disabled_error text;
  v_json jsonb;
begin
  begin
    perform * from public.ejnexa_submit_catalog_request(
      'unknown-catalog', gen_random_uuid(), 'Customer', '', null, '',
      jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 1))
    );
    raise exception 'TEST_FAILED: unknown catalog accepted';
  exception when others then
    if sqlerrm like 'TEST_FAILED:%' then raise; end if;
    v_unknown_error := sqlerrm;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request(
      'catalog-request-disabled', gen_random_uuid(), 'Customer', '', null, '',
      jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 1))
    );
    raise exception 'TEST_FAILED: disabled catalog accepted';
  exception when others then
    if sqlerrm like 'TEST_FAILED:%' then raise; end if;
    v_disabled_error := sqlerrm;
  end;
  if v_unknown_error <> 'Catalog not available' or v_disabled_error <> v_unknown_error then
    raise exception 'Unknown and disabled catalogs do not share one generic error';
  end if;

  -- Server-side input validation, public-product checks, quantity limits, and atomic rollback.
  for v_json in
    select case label
      when 'private product' then jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000004', 'quantity', 1))
      when 'inactive product' then jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000005', 'quantity', 1))
      when 'cross-tenant product' then jsonb_build_array(jsonb_build_object('product_id', 'bbbbbbbb-0001-4000-8000-000000000001', 'quantity', 1))
      when 'duplicate product' then jsonb_build_array(
        jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 1),
        jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 2)
      )
      when 'zero quantity' then jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 0))
      when 'negative quantity' then jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', -1))
      when 'decimal quantity' then jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 1.5))
      when 'string quantity' then jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', '2'))
      when 'null quantity' then jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 'null'::jsonb))
      when 'quantity over limit' then jsonb_build_array(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 10000))
      when 'missing product id' then jsonb_build_array(jsonb_build_object('quantity', 1))
      when 'invalid product id' then jsonb_build_array(jsonb_build_object('product_id', 'not-a-uuid', 'quantity', 1))
      when 'duplicate payload item' then jsonb_build_array('"not-an-object"'::jsonb)
      when 'atomic mixed products' then jsonb_build_array(
        jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 1),
        jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000004', 'quantity', 1)
      )
      else null
    end as payload
    from (values
      ('private product'), ('inactive product'), ('cross-tenant product'), ('duplicate product'),
      ('zero quantity'), ('negative quantity'), ('decimal quantity'), ('string quantity'),
      ('null quantity'), ('quantity over limit'), ('missing product id'), ('invalid product id'),
      ('duplicate payload item'), ('atomic mixed products')
    ) as cases(label)
  loop
    begin
      perform * from public.ejnexa_submit_catalog_request(
        'catalog-request-a', gen_random_uuid(), 'Valid Customer', '', current_date, '', v_json
      );
      raise exception 'TEST_FAILED: invalid request item accepted';
    exception when others then
      if sqlerrm like 'TEST_FAILED:%' then raise; end if;
    end;
  end loop;

  -- Header fields, item array shape and size are independently validated on the server.
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), '', '', null, '', v_items);
    raise exception 'TEST_FAILED: empty customer name accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), 'A', '', null, '', v_items);
    raise exception 'TEST_FAILED: one-character customer name accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), repeat('N', 101), '', null, '', v_items);
    raise exception 'TEST_FAILED: overlong customer name accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), 'Valid Name', repeat('5', 31), null, '', v_items);
    raise exception 'TEST_FAILED: overlong phone accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), 'Valid Name', '', current_date - 1, '', v_items);
    raise exception 'TEST_FAILED: past desired date accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), 'Valid Name', '', null, repeat('D', 1001), v_items);
    raise exception 'TEST_FAILED: overlong details accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), 'Valid Name', '', null, '', null);
    raise exception 'TEST_FAILED: null items accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), 'Valid Name', '', null, '', '{}'::jsonb);
    raise exception 'TEST_FAILED: object items accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request('catalog-request-a', gen_random_uuid(), 'Valid Name', '', null, '', '[]'::jsonb);
    raise exception 'TEST_FAILED: empty items accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform * from public.ejnexa_submit_catalog_request(
      'catalog-request-a', gen_random_uuid(), 'Valid Name', '', null, '',
      (select jsonb_agg(jsonb_build_object('product_id', 'aaaaaaaa-0001-4000-8000-000000000001', 'quantity', 1)) from generate_series(1, 51))
    );
    raise exception 'TEST_FAILED: more than 50 items accepted';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
end $$;
reset role;

  -- Verify saved snapshots come from the database, not submitted name/price/tenant fields.
do $$
declare
  v_year integer := extract(year from now())::integer;
begin
  if (select count(*) from public.arpe_catalog_requests) <> 3 then
    raise exception 'Unexpected request count or a failed request left a partial header';
  end if;
  if (select count(*) from public.arpe_catalog_request_items) <> 5 then
    raise exception 'Unexpected item count or a failed request left partial items';
  end if;
  if (select count(*) from public.arpe_catalog_requests where client_request_key = 'dddddddd-0001-4000-8000-000000000001') <> 2 then
    raise exception 'The same idempotency key was not scoped separately per business';
  end if;
  if (select count(*) from public.arpe_quotes) <> 0 or (select count(*) from public.arpe_orders) <> 0 then
    raise exception 'Public intake created a quote or order';
  end if;
  if not exists (
    select 1 from public.arpe_catalog_requests r
    where r.id = current_setting('test.catalog_request_a1_id')::uuid
      and r.business_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and r.request_number = 'SOL-' || v_year::text || '-0001'
      and r.status = 'new'
      and r.customer_name = 'María Cliente'
      and r.customer_phone = ''
      and r.details = '  detalles  '
      and r.desired_date = current_date + 1
      and r.converted_quote_id is null
  ) then
    raise exception 'Request header validation/defaults are incorrect';
  end if;
  if not exists (
    select 1 from public.arpe_catalog_request_items i
    where i.request_id = current_setting('test.catalog_request_a1_id')::uuid
      and i.catalog_product_id = 'aaaaaaaa-0001-4000-8000-000000000001'
      and i.product_name_snapshot = 'Pastel Exacto'
      and i.category_snapshot = 'Pasteles'
      and i.quantity = 2
      and i.default_portions_snapshot = 12
      and i.public_price_mode_snapshot = 'exact'
      and i.public_unit_price_snapshot = 850
  ) or not exists (
    select 1 from public.arpe_catalog_request_items i
    where i.request_id = current_setting('test.catalog_request_a1_id')::uuid
      and i.catalog_product_id = 'aaaaaaaa-0001-4000-8000-000000000002'
      and i.product_name_snapshot = 'Caja Desde'
      and i.quantity = 3
      and i.public_price_mode_snapshot = 'from'
      and i.public_unit_price_snapshot = 80
  ) or not exists (
    select 1 from public.arpe_catalog_request_items i
    where i.request_id = current_setting('test.catalog_request_a1_id')::uuid
      and i.catalog_product_id = 'aaaaaaaa-0001-4000-8000-000000000003'
      and i.product_name_snapshot = 'Decoración Consultar'
      and i.quantity = 1
      and i.public_price_mode_snapshot = 'contact'
      and i.public_unit_price_snapshot is null
  ) then
    raise exception 'Database product snapshots or price-mode handling are incorrect';
  end if;
  if exists (
    select 1 from public.arpe_catalog_request_items i
    where i.request_id = current_setting('test.catalog_request_a1_id')::uuid
      and (i.product_name_snapshot = 'HACK' or i.public_unit_price_snapshot = 1
        or i.business_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  ) then
    raise exception 'Client-supplied snapshot or tenant data was persisted';
  end if;
  if exists (
    select 1 from public.arpe_catalog_requests r
    where r.business_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and r.client_request_key in (
        'eeeeeeee-0001-4000-8000-000000000001', 'eeeeeeee-0001-4000-8000-000000000002',
        'eeeeeeee-0001-4000-8000-000000000003', 'eeeeeeee-0001-4000-8000-000000000004',
        'eeeeeeee-0001-4000-8000-000000000005', 'eeeeeeee-0001-4000-8000-000000000006',
        'eeeeeeee-0001-4000-8000-000000000007', 'eeeeeeee-0001-4000-8000-000000000008',
        'eeeeeeee-0001-4000-8000-000000000009', 'eeeeeeee-0001-4000-8000-000000000010'
      )
  ) then
    raise exception 'An invalid request left a persisted header';
  end if;

  -- Tenant-safe composite foreign keys reject a request item linked across businesses.
  begin
    insert into public.arpe_catalog_request_items (
      request_id, business_id, catalog_product_id, position, product_name_snapshot,
      category_snapshot, quantity, unit_label_snapshot, public_price_mode_snapshot, public_unit_price_snapshot
    ) values (
      current_setting('test.catalog_request_a1_id')::uuid,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-0001-4000-8000-000000000001', 99, 'Wrong tenant', 'Test', 1, 'unidad', 'exact', 1
    );
    raise exception 'TEST_FAILED: cross-tenant item foreign key accepted';
  exception when foreign_key_violation then null;
  end;

end $$;

-- Authenticated owners can read only their own requests/items and cannot write directly.
select set_config('request.jwt.claim.sub', '11111111-aaaa-4aaa-8aaa-111111111111', true);
set local role authenticated;
do $$ begin
    if (select count(*) from public.arpe_catalog_requests) <> 2
       or exists (select 1 from public.arpe_catalog_requests where business_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
      raise exception 'Owner A can see another business request';
    end if;
    if (select count(*) from public.arpe_catalog_request_items) <> 4
       or exists (select 1 from public.arpe_catalog_request_items where business_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
      raise exception 'Owner A can see another business request item';
    end if;
    begin
      insert into public.arpe_catalog_requests (business_id, request_number, client_request_key, customer_name)
      values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SOL-2026-8888', gen_random_uuid(), 'Direct owner insert');
      raise exception 'TEST_FAILED: authenticated owner inserted requests directly';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.arpe_catalog_requests set status = 'reviewing';
      raise exception 'TEST_FAILED: authenticated owner updated requests directly';
    exception when insufficient_privilege then null;
    end;
    begin
      delete from public.arpe_catalog_requests;
      raise exception 'TEST_FAILED: authenticated owner deleted requests directly';
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.arpe_catalog_request_items (request_id, business_id, catalog_product_id, position, product_name_snapshot, category_snapshot, quantity, unit_label_snapshot, public_price_mode_snapshot, public_unit_price_snapshot)
      values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0001-4000-8000-000000000001', 1, 'Direct', 'Test', 1, 'unidad', 'exact', 1);
      raise exception 'TEST_FAILED: authenticated owner inserted request items directly';
    exception when insufficient_privilege then null;
    end;
    begin
      update public.arpe_catalog_request_items set quantity = 2;
      raise exception 'TEST_FAILED: authenticated owner updated request items directly';
    exception when insufficient_privilege then null;
    end;
    begin
      delete from public.arpe_catalog_request_items;
      raise exception 'TEST_FAILED: authenticated owner deleted request items directly';
    exception when insufficient_privilege then null;
    end;
    begin
      perform 1 from private.arpe_catalog_request_sequences;
      raise exception 'TEST_FAILED: authenticated owner read private sequences';
    exception when insufficient_privilege then null;
    end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '22222222-bbbb-4bbb-8bbb-222222222222', true);
set local role authenticated;
do $$ begin
    if (select count(*) from public.arpe_catalog_requests) <> 1
       or exists (select 1 from public.arpe_catalog_requests where business_id <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
      raise exception 'Owner B can see another business request';
    end if;
    if (select count(*) from public.arpe_catalog_request_items) <> 1
       or exists (select 1 from public.arpe_catalog_request_items where business_id <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
      raise exception 'Owner B can see another business request item';
    end if;
end $$;
reset role;

select ok(true, 'catalog request intake validates RPC privileges, RLS, tenant-safe snapshots, idempotency, numbering, input limits and rollback');
select * from finish();
rollback;
