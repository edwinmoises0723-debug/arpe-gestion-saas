-- LOCAL ONLY. Verify authenticated request actions and tenant isolation.
begin;
select plan(1);

insert into auth.users(id) values
  ('11111111-aaaa-4aaa-8aaa-111111111111'),
  ('22222222-bbbb-4bbb-8bbb-222222222222');

insert into public.arpe_businesses(id, owner_id, name)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-aaaa-4aaa-8aaa-111111111111', 'Business A'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-bbbb-4bbb-8bbb-222222222222', 'Business B');

insert into public.arpe_catalog_products(id, business_id, name)
values
  ('aaaaaaaa-0001-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Product A'),
  ('bbbbbbbb-0001-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Product B');

insert into public.arpe_catalog_requests(id, business_id, request_number, client_request_key, customer_name, status)
values
  ('aaaaaaaa-1000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SOL-2026-0001', 'aaaaaaaa-2000-4000-8000-000000000001', 'Customer A1', 'new'),
  ('aaaaaaaa-1000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SOL-2026-0002', 'aaaaaaaa-2000-4000-8000-000000000002', 'Customer A2', 'new'),
  ('aaaaaaaa-1000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'SOL-2026-0003', 'aaaaaaaa-2000-4000-8000-000000000003', 'Customer A3', 'converted'),
  ('bbbbbbbb-1000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'SOL-2026-0001', 'bbbbbbbb-2000-4000-8000-000000000001', 'Customer B1', 'new');

insert into public.arpe_catalog_request_items(
  request_id, business_id, catalog_product_id, position, product_name_snapshot,
  category_snapshot, quantity, unit_label_snapshot, public_price_mode_snapshot, public_unit_price_snapshot
)
values
  ('aaaaaaaa-1000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0001-4000-8000-000000000001', 1, 'Snapshot A', 'Cakes', 1, 'unidad', 'exact', 100),
  ('bbbbbbbb-1000-4000-8000-000000000001', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0001-4000-8000-000000000001', 1, 'Snapshot B', 'Cakes', 1, 'unidad', 'exact', 100);

do $$
declare
  v_reviewing oid := 'public.ejnexa_mark_catalog_request_reviewing(uuid)'::regprocedure;
  v_decline oid := 'public.ejnexa_decline_catalog_request(uuid)'::regprocedure;
  v_archive oid := 'public.ejnexa_archive_catalog_request(uuid)'::regprocedure;
begin
  if not has_function_privilege('authenticated', v_reviewing, 'EXECUTE')
     or not has_function_privilege('authenticated', v_decline, 'EXECUTE')
     or not has_function_privilege('authenticated', v_archive, 'EXECUTE')
     or has_function_privilege('anon', v_reviewing, 'EXECUTE')
     or has_function_privilege('anon', v_decline, 'EXECUTE')
     or has_function_privilege('anon', v_archive, 'EXECUTE') then
    raise exception 'Request state RPC privileges are incorrect';
  end if;
  if exists (
    select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid in (v_reviewing, v_decline, v_archive)
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC can execute an internal request RPC';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '11111111-aaaa-4aaa-8aaa-111111111111', true);
set local role authenticated;
do $$
declare
  v_status text;
  v_cross_tenant_error text;
  v_missing_error text;
begin
  if (select count(*) from public.arpe_catalog_requests) <> 3
     or exists (select 1 from public.arpe_catalog_requests where business_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'Owner A can see another tenant request';
  end if;
  if (select count(*) from public.arpe_catalog_request_items) <> 1
     or exists (select 1 from public.arpe_catalog_request_items where business_id <> 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then
    raise exception 'Owner A can see another tenant request item';
  end if;

  begin
    update public.arpe_catalog_requests set status = 'reviewing'
    where id = 'aaaaaaaa-1000-4000-8000-000000000001';
    raise exception 'TEST_FAILED: owner directly updated request status';
  exception when insufficient_privilege then null;
  end;

  v_status := public.ejnexa_mark_catalog_request_reviewing('aaaaaaaa-1000-4000-8000-000000000001');
  if v_status <> 'reviewing' then raise exception 'Owner A could not mark own request reviewing'; end if;

  begin
    perform public.ejnexa_mark_catalog_request_reviewing('bbbbbbbb-1000-4000-8000-000000000001');
    raise exception 'TEST_FAILED: Owner A changed Owner B request';
  exception when others then
    if sqlerrm like 'TEST_FAILED:%' then raise; end if;
    v_cross_tenant_error := sqlerrm;
  end;
  begin
    perform public.ejnexa_mark_catalog_request_reviewing('cccccccc-1000-4000-8000-000000000001');
    raise exception 'TEST_FAILED: missing request was accepted';
  exception when others then
    if sqlerrm like 'TEST_FAILED:%' then raise; end if;
    v_missing_error := sqlerrm;
  end;
  if v_cross_tenant_error <> v_missing_error then
    raise exception 'Cross-tenant and missing request errors reveal different outcomes';
  end if;

  v_status := public.ejnexa_decline_catalog_request('aaaaaaaa-1000-4000-8000-000000000001');
  if v_status <> 'declined' then raise exception 'Owner A could not decline a reviewing request'; end if;
  v_status := public.ejnexa_archive_catalog_request('aaaaaaaa-1000-4000-8000-000000000001');
  if v_status <> 'archived' then raise exception 'Owner A could not archive a declined request'; end if;
  v_status := public.ejnexa_decline_catalog_request('aaaaaaaa-1000-4000-8000-000000000002');
  if v_status <> 'declined' then raise exception 'Owner A could not decline a new request'; end if;
  v_status := public.ejnexa_archive_catalog_request('aaaaaaaa-1000-4000-8000-000000000002');
  if v_status <> 'archived' then raise exception 'Owner A could not archive a new/declined request'; end if;

  begin
    perform public.ejnexa_mark_catalog_request_reviewing('aaaaaaaa-1000-4000-8000-000000000003');
    raise exception 'TEST_FAILED: converted request was changed';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform public.ejnexa_decline_catalog_request('aaaaaaaa-1000-4000-8000-000000000003');
    raise exception 'TEST_FAILED: converted request was declined';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;
  begin
    perform public.ejnexa_archive_catalog_request('aaaaaaaa-1000-4000-8000-000000000003');
    raise exception 'TEST_FAILED: converted request was archived';
  exception when others then if sqlerrm like 'TEST_FAILED:%' then raise; end if;
  end;

  if (select status from public.arpe_catalog_requests where id = 'aaaaaaaa-1000-4000-8000-000000000003') <> 'converted' then
    raise exception 'A state RPC altered the converted status';
  end if;
end $$;
reset role;

select set_config('request.jwt.claim.sub', '22222222-bbbb-4bbb-8bbb-222222222222', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.arpe_catalog_requests) <> 1
     or exists (select 1 from public.arpe_catalog_requests where business_id <> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb') then
    raise exception 'Owner B can see another tenant request';
  end if;
  if (select public.ejnexa_mark_catalog_request_reviewing('bbbbbbbb-1000-4000-8000-000000000001')) <> 'reviewing' then
    raise exception 'Owner B could not update their own request';
  end if;
end $$;
reset role;

set local role anon;
do $$ begin
  begin
    perform 1 from public.arpe_catalog_requests;
    raise exception 'TEST_FAILED: anon read requests';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.arpe_catalog_request_items;
    raise exception 'TEST_FAILED: anon read request items';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ejnexa_mark_catalog_request_reviewing('aaaaaaaa-1000-4000-8000-000000000001');
    raise exception 'TEST_FAILED: anon executed internal status RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select ok(true, 'internal catalog request RPCs enforce owner tenant, allowed transitions, read-only RLS, and no arbitrary converted status');
select * from finish();
rollback;
