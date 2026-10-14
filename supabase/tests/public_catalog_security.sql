-- LOCAL ONLY. Run after migrations in a disposable local Supabase database.
-- Test fixtures are rolled back. Do not point this script at production.
begin;
select plan(1);
insert into auth.users(id) values
  ('cccccccc-3333-4333-8333-333333333333'),
  ('dddddddd-4444-4444-8444-444444444444');
insert into public.arpe_businesses(id, owner_id, name, catalog_slug, public_catalog_enabled, whatsapp)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-3333-4333-8333-333333333333','Catalog A','catalog-a',false,'+50511111111'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','dddddddd-4444-4444-8444-444444444444','Catalog B','catalog-b',true,'+50522222222');
insert into public.arpe_catalog_products(id,business_id,name,category,description,default_unit_price,default_portions,default_flavor,default_extras,is_active,is_public,public_price_mode,public_sort_order)
values
  ('cccccccc-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','Disabled item','Cakes','Public description',100,8,'PRIVATE FLAVOR','PRIVATE EXTRA',true,true,'exact',0),
  ('dddddddd-aaaa-4aaa-8aaa-aaaaaaaaaaaa','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Inactive item','Cakes','Public description',200,10,'PRIVATE FLAVOR','PRIVATE EXTRA',false,true,'from',0),
  ('dddddddd-bbbb-4bbb-8bbb-bbbbbbbbbbbb','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Private item','Cakes','Public description',300,12,'PRIVATE FLAVOR','PRIVATE EXTRA',true,false,'contact',0),
  ('dddddddd-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Public item','Cakes','Public description',400,16,'PRIVATE FLAVOR','PRIVATE EXTRA',true,true,'from',2),
  ('dddddddd-eeee-4eee-8eee-eeeeeeeeeeee','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Contact item','Cakes','Public description',5000,16,'PRIVATE FLAVOR','PRIVATE EXTRA',true,true,'contact',3);

set local role anon;
do $$ declare profile jsonb; products jsonb; begin
  if has_table_privilege('anon','public.arpe_businesses','SELECT') then raise exception 'Anonymous has direct business SELECT'; end if;
  if has_table_privilege('anon','public.arpe_catalog_products','SELECT') then raise exception 'Anonymous has direct product SELECT'; end if;
  begin
    perform * from public.arpe_businesses;
    raise exception 'TEST_FAILED anonymous business table read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.arpe_catalog_products;
    raise exception 'TEST_FAILED anonymous product table read allowed';
  exception when insufficient_privilege then null; end;
  if (select count(*) from public.ejnexa_get_public_catalog_profile('catalog-a')) <> 0 then raise exception 'Disabled catalog exposed its profile'; end if;
  if (select count(*) from public.ejnexa_get_public_catalog_products('catalog-a')) <> 0 then raise exception 'Disabled catalog exposed products'; end if;
  if (select count(*) from public.ejnexa_get_public_catalog_profile('unknown-slug')) <> 0 then raise exception 'Unknown slug revealed a profile'; end if;
  select to_jsonb(p) into profile from public.ejnexa_get_public_catalog_profile('catalog-b') p;
  if profile->>'name' <> 'Catalog B' or profile->>'whatsapp' <> '+50522222222' then raise exception 'Public profile values missing'; end if;
  if profile ?| array['owner_id','email','address','default_deposit_value'] then raise exception 'Private business fields exposed'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(profile) as keys(k)) <> array['catalog_slug','currency','description','name','public_catalog_logo_path','slogan','whatsapp'] then raise exception 'Profile RPC field allowlist mismatch'; end if;
  select jsonb_agg(to_jsonb(p)) into products from public.ejnexa_get_public_catalog_products('catalog-b') p;
  if jsonb_array_length(products) <> 2 or products->0->>'name' <> 'Public item' or products->1->>'name' <> 'Contact item' then raise exception 'Public product filters or ordering failed'; end if;
  if products->1->'default_unit_price' <> 'null'::jsonb then raise exception 'Contact price was exposed'; end if;
  if (products->0) ?| array['default_flavor','default_filling','default_decoration','default_extras','business_id','cost','markup','owner_id'] then raise exception 'Private product fields exposed'; end if;
  if (select array_agg(k order by k) from jsonb_object_keys(products->0) as keys(k)) <> array['category','default_portions','default_unit_price','description','id','image_path','name','public_price_mode','public_sort_order','unit_label'] then raise exception 'Product RPC field allowlist mismatch'; end if;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claim.sub','cccccccc-3333-4333-8333-333333333333',true); end $$;
set local role authenticated;
do $$ declare affected integer; invalid_path text; begin
  if not has_column_privilege('authenticated','public.arpe_businesses','catalog_slug','UPDATE')
    or not has_column_privilege('authenticated','public.arpe_businesses','public_catalog_enabled','UPDATE')
    or not has_column_privilege('authenticated','public.arpe_businesses','public_catalog_show_whatsapp','UPDATE')
    or not has_column_privilege('authenticated','public.arpe_businesses','public_catalog_logo_path','UPDATE') then
    raise exception 'Owner catalog business column grants are incomplete';
  end if;
  if has_column_privilege('authenticated','public.arpe_businesses','owner_id','UPDATE') then raise exception 'Catalog migration granted owner_id update'; end if;
  update public.arpe_businesses set catalog_slug='arpe-dulce-encanto', public_catalog_enabled=true,
    public_catalog_show_whatsapp=true, public_catalog_logo_path='cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/profile/logo.png'
    where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner could not update own catalog settings'; end if;
  insert into public.arpe_catalog_products(business_id,name,image_path) values
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Owner managed','cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/own.png');
  update public.arpe_catalog_products set is_public=true where name='Owner managed';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Owner could not manage own product'; end if;
  update public.arpe_catalog_products set name='Cross tenant edit' where id='dddddddd-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-tenant product update succeeded'; end if;
  update public.arpe_businesses set catalog_slug='owner-a-tampered' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-tenant business update succeeded'; end if;
  begin
    update public.arpe_catalog_products set image_path='dddddddd-4444-4444-8444-444444444444/dddddddd-dddd-4ddd-8ddd-dddddddddddd/products/foreign.png' where name='Owner managed';
    raise exception 'TEST_FAILED cross-tenant image path accepted';
  exception when check_violation then null; end;
  foreach invalid_path in array array[
    'dddddddd-4444-4444-8444-444444444444/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/wrong-owner.png',
    'cccccccc-3333-4333-8333-333333333333/dddddddd-dddd-4ddd-8ddd-dddddddddddd/products/wrong-business.png',
    'cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/profile/wrong-folder.png',
    'cccccccc-3333-4333-8333-333333333333/cccccccc-cccc-4ccc-8ccc-cccccccccccc/products/nested/extra.png'
  ] loop
    begin
      update public.arpe_catalog_products set image_path=invalid_path where name='Owner managed';
      raise exception 'TEST_FAILED invalid product path accepted: %', invalid_path;
    exception when check_violation then null; end;
  end loop;
  begin
    update public.arpe_businesses set public_catalog_logo_path='dddddddd-4444-4444-8444-444444444444/dddddddd-dddd-4ddd-8ddd-dddddddddddd/profile/foreign.png'
      where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'TEST_FAILED cross-tenant profile path accepted';
  exception when check_violation then null; end;
  begin
    update public.arpe_businesses set catalog_slug=null, public_catalog_enabled=true where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'TEST_FAILED enabled catalog without slug accepted';
  exception when check_violation then null; end;
  begin
    update public.arpe_businesses set catalog_slug='Bad Slug!'
      where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'TEST_FAILED invalid slug accepted';
  exception when check_violation then null; end;
end $$;
reset role;

do $$ begin perform set_config('request.jwt.claim.sub','dddddddd-4444-4444-8444-444444444444',true); end $$;
set local role authenticated;
do $$ begin
  update public.arpe_businesses set public_catalog_show_whatsapp=false where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  begin
    update public.arpe_businesses set catalog_slug='arpe-dulce-encanto' where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    raise exception 'TEST_FAILED duplicate slug accepted';
  exception when unique_violation then null; end;
end $$;
reset role;
set local role anon;
do $$ declare profile jsonb; begin
  select to_jsonb(p) into profile from public.ejnexa_get_public_catalog_profile('catalog-b') p;
  if profile->>'whatsapp' is not null then raise exception 'WhatsApp shown when disabled'; end if;
end $$;
reset role;

do $$ declare profile_fn oid; products_fn oid; begin
  select p.oid into profile_fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ejnexa_get_public_catalog_profile';
  select p.oid into products_fn from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ejnexa_get_public_catalog_products';
  if profile_fn is null or products_fn is null then raise exception 'Public catalog RPC missing'; end if;
  if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=profile_fn) then raise exception 'Profile RPC is not hardened SECURITY DEFINER'; end if;
  if not (select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid=products_fn) then raise exception 'Products RPC is not hardened SECURITY DEFINER'; end if;
  if exists (select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) acl
    where p.oid in (profile_fn,products_fn) and acl.grantee=0 and acl.privilege_type='EXECUTE') then raise exception 'PUBLIC has catalog RPC execute'; end if;
  if not has_function_privilege('anon','public.ejnexa_get_public_catalog_profile(text)','EXECUTE')
    or not has_function_privilege('authenticated','public.ejnexa_get_public_catalog_profile(text)','EXECUTE')
    or not has_function_privilege('anon','public.ejnexa_get_public_catalog_products(text)','EXECUTE')
    or not has_function_privilege('authenticated','public.ejnexa_get_public_catalog_products(text)','EXECUTE') then raise exception 'Catalog RPC execute grants are incomplete'; end if;
end $$;
select ok(true, 'public catalog tenant, grants, RPC allowlists and filtering assertions passed');
select * from finish();
rollback;
