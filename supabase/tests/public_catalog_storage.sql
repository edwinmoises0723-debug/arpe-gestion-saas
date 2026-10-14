-- LOCAL ONLY. Requires the catalog migration and a disposable local Supabase database.
-- This test exercises actual Storage RLS insert/delete checks and rolls back all fixtures.
begin;
select plan(1);
insert into auth.users(id) values
  ('cccccccc-3333-4333-8333-333333333333'),
  ('dddddddd-4444-4444-8444-444444444444');
insert into public.arpe_businesses(id, owner_id, name)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-3333-4333-8333-333333333333','Storage A'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-4444-4444-8444-444444444444','Storage B');

do $$ declare bucket storage.buckets; insert_policy text; delete_policy text; begin
  select * into bucket from storage.buckets where id='ejnexa-catalog-media';
  if bucket.id is null or bucket.public is not true or bucket.file_size_limit <> 5242880 then raise exception 'Catalog bucket is missing or has wrong visibility/size'; end if;
  if bucket.allowed_mime_types is distinct from array['image/png','image/jpeg','image/webp']::text[] then raise exception 'Catalog bucket MIME allowlist mismatch'; end if;
  select with_check into insert_policy from pg_policies where schemaname='storage' and tablename='objects' and policyname='Catalog owners can upload marketing media';
  select qual into delete_policy from pg_policies where schemaname='storage' and tablename='objects' and policyname='Catalog owners can delete marketing media';
  if insert_policy not ilike '%auth.uid()%' or insert_policy not ilike '%arpe_businesses%' or insert_policy not ilike '%foldername%' or insert_policy not ilike '%cardinality%' or insert_policy not ilike '%filename%' then raise exception 'Upload policy does not enforce exact owner/business/folder/file path'; end if;
  if delete_policy not ilike '%auth.uid()%' or delete_policy not ilike '%arpe_businesses%' or delete_policy not ilike '%foldername%' or delete_policy not ilike '%cardinality%' or delete_policy not ilike '%filename%' then raise exception 'Delete policy does not enforce exact owner/business/folder/file path'; end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Catalog owners can upload marketing media' and cmd='INSERT' and roles @> array['authenticated']::name[]) then raise exception 'Upload must require authentication'; end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Catalog owners can delete marketing media' and cmd='DELETE' and roles @> array['authenticated']::name[]) then raise exception 'Delete must require authentication'; end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname ilike '%catalog%' and roles @> array['anon']::name[]) then raise exception 'Anonymous media write policy exists'; end if;
  if exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Catalog owners can update marketing media') then raise exception 'Unexpected storage update policy'; end if;
end $$;

-- Seed a foreign object as the local database owner, then prove owner A cannot delete it.
insert into storage.objects(bucket_id, name, owner_id)
values
  ('ejnexa-catalog-media','dddddddd-4444-4444-8444-444444444444/dddddddd-dddd-4ddd-8ddd-dddddddddddd/products/foreign.png','dddddddd-4444-4444-8444-444444444444'),
  ('ejnexa-catalog-media','cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/for-anon.png','cccccccc-3333-4333-8333-333333333333');
do $$ begin perform set_config('request.jwt.claim.sub','cccccccc-3333-4333-8333-333333333333',true); end $$;
set local role authenticated;
do $$ declare affected integer; begin
  if auth.uid() <> 'cccccccc-3333-4333-8333-333333333333'::uuid then raise exception 'Storage test JWT subject was not applied'; end if;
  if storage.foldername('cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png')
    <> array['cccccccc-3333-4333-8333-333333333333','cccccccc-cccc-4ccc-8ccc-cccccccccccc','products']::text[] then
    raise exception 'Storage folder path parsing did not match the asserted namespace';
  end if;
  if not exists (select 1 from public.arpe_businesses where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' and owner_id=auth.uid()) then
    raise exception 'Authenticated owner cannot read its fixture business';
  end if;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values ('ejnexa-catalog-media','cccccccc-3333-4333-8333-333333333333/dddddddd-dddd-4ddd-8ddd-dddddddddddd/products/foreign-business.png','cccccccc-3333-4333-8333-333333333333');
    raise exception 'TEST_FAILED owner A uploaded inside owner B business';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values ('ejnexa-catalog-media','dddddddd-4444-4444-8444-444444444444/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/wrong-owner.png','dddddddd-4444-4444-8444-444444444444');
    raise exception 'TEST_FAILED owner A accepted media with owner B folder';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values ('ejnexa-catalog-media','cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/private/invalid.png','cccccccc-3333-4333-8333-333333333333');
    raise exception 'TEST_FAILED unsupported media folder accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id,name,owner_id) values ('ejnexa-catalog-media','cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/nested/invalid.png','cccccccc-3333-4333-8333-333333333333');
    raise exception 'TEST_FAILED arbitrary nested media path accepted';
  exception when insufficient_privilege then null; end;
  raise notice 'Catalog upload condition: %, effective Storage insert policies: %',
    ('ejnexa-catalog-media' = 'ejnexa-catalog-media'
      and (storage.foldername('cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png'))[1] = (select auth.uid())::text
      and exists (select 1 from public.arpe_businesses b where b.id::text = (storage.foldername('cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png'))[2] and b.owner_id = (select auth.uid()))
      and (storage.foldername('cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png'))[3] in ('products', 'profile')
      and cardinality(storage.foldername('cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png')) = 3
      and storage.filename('cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png') <> ''),
    (select jsonb_agg(jsonb_build_object('name', policyname, 'command', cmd, 'mode', permissive, 'roles', roles, 'check', with_check))
      from pg_policies where schemaname='storage' and tablename='objects');
  insert into storage.objects(bucket_id,name,owner_id) values ('ejnexa-catalog-media','cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png','cccccccc-3333-4333-8333-333333333333');
  delete from storage.objects where bucket_id='ejnexa-catalog-media' and name='dddddddd-4444-4444-8444-444444444444/dddddddd-dddd-4ddd-8ddd-dddddddddddd/products/foreign.png';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'TEST_FAILED owner A deleted owner B media'; end if;
  delete from storage.objects where bucket_id='ejnexa-catalog-media' and name='cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner A could not delete own media'; end if;
end $$;
reset role;
set local role anon;
do $$ declare affected integer; begin
  begin
    insert into storage.objects(bucket_id,name,owner_id) values ('ejnexa-catalog-media','cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/anon.png','cccccccc-3333-4333-8333-333333333333');
    raise exception 'TEST_FAILED anon inserted catalog media';
  exception when insufficient_privilege then null; end;
  begin
    delete from storage.objects where bucket_id='ejnexa-catalog-media' and name='cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/for-anon.png';
    get diagnostics affected = row_count;
    if affected <> 0 then raise exception 'TEST_FAILED anon deleted catalog media'; end if;
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select ok(true, 'catalog Storage ownership, exact paths, bucket and policies assertions passed');
select * from finish();
rollback;
