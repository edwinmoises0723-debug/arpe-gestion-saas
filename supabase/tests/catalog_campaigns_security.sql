-- EJNEXA Business Staging only. Fixed cross-industry fixtures are rolled back.
begin;

insert into auth.users (id, email) values
  ('50000000-0000-4000-8000-000000000001', 'campaign-owner-a@example.test'),
  ('50000000-0000-4000-8000-000000000002', 'campaign-owner-b@example.test');

insert into public.arpe_businesses (id, owner_id, name, catalog_slug, public_catalog_enabled, currency)
values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'ARPE test fixture — pastelería', 'campaign-test-arpe', true, 'NIO'),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Retail fixture B — tienda de zapatos', 'campaign-test-retail', true, 'USD');

insert into public.arpe_catalog_products (
  id, business_id, name, category, unit_label, default_unit_price, is_active, is_public, public_price_mode
)
values
  ('52000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'Cupcakes', 'Cupcakes', 'docena', 1000, true, true, 'exact'),
  ('52000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 'Fixed discount', 'Pasteles', 'unidad', 1000, true, true, 'exact'),
  ('52000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', 'Fixed price', 'Pasteles', 'unidad', 1000, true, true, 'exact'),
  ('52000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000001', 'Two for one', 'Pasteles', 'unidad', 1000, true, true, 'exact'),
  ('52000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000001', 'Showcase', 'Pasteles', 'unidad', 1000, true, true, 'exact'),
  ('52000000-0000-4000-8000-000000000006', '51000000-0000-4000-8000-000000000001', 'Contact price', 'Pasteles', 'unidad', 1000, true, true, 'contact'),
  ('52000000-0000-4000-8000-000000000007', '51000000-0000-4000-8000-000000000001', 'Expired', 'Pasteles', 'unidad', 1000, true, true, 'exact'),
  ('52000000-0000-4000-8000-000000000008', '51000000-0000-4000-8000-000000000001', 'Future', 'Pasteles', 'unidad', 1000, true, true, 'exact'),
  ('52000000-0000-4000-8000-000000000009', '51000000-0000-4000-8000-000000000002', 'Zapatos', 'Zapatos', 'par', 50, true, true, 'exact'),
  ('52000000-0000-4000-8000-000000000010', '51000000-0000-4000-8000-000000000001', 'Combo', 'Pasteles', 'unidad', 1000, true, true, 'exact');

insert into public.ejnexa_catalog_campaigns (
  id, business_id, name, description, campaign_kind, promotion_type,
  percentage_discount, fixed_discount, promo_price, badge_text, image_path,
  starts_on, ends_on, active, featured, sort_order
)
values
  ('53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '25 percent', '', 'promotion', 'percentage', 25, null, null, null, null, current_date, current_date + 2, true, true, 1),
  ('53000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', 'Fixed discount', '', 'promotion', 'fixed_discount', null, 125, null, null, null, current_date, current_date, true, false, 2),
  ('53000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', 'Fixed price', '', 'promotion', 'fixed_price', null, null, 700, null,
    '50000000-0000-4000-8000-000000000001/51000000-0000-4000-8000-000000000001/campaigns/special.png', current_date, current_date, true, false, 3),
  ('53000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000001', 'Two for one', '', 'promotion', 'two_for_one', null, null, null, null, null, current_date, current_date, true, false, 4),
  ('53000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000001', 'New this season', '', 'showcase', null, null, null, null, 'Nuevo', null, current_date, current_date, true, true, 5),
  ('53000000-0000-4000-8000-000000000006', '51000000-0000-4000-8000-000000000001', 'Hidden contact discount', '', 'promotion', 'percentage', 50, null, null, '50% OFF', null, current_date, current_date, true, false, 6),
  ('53000000-0000-4000-8000-000000000007', '51000000-0000-4000-8000-000000000001', 'Expired campaign', '', 'promotion', 'fixed_price', null, null, 100, null, null, current_date - 2, current_date - 1, true, false, 7),
  ('53000000-0000-4000-8000-000000000008', '51000000-0000-4000-8000-000000000001', 'Future campaign', '', 'promotion', 'fixed_price', null, null, 100, null, null, current_date + 1, current_date + 2, true, false, 8),
  ('53000000-0000-4000-8000-000000000013', '51000000-0000-4000-8000-000000000001', 'Combo campaign', '', 'promotion', 'combo', null, null, null, null, null, current_date, current_date, true, false, 9),
  ('53000000-0000-4000-8000-000000000014', '51000000-0000-4000-8000-000000000002', 'Shoe pair offer', '', 'promotion', 'two_for_one', null, null, null, null, null, current_date, current_date, true, false, 1);

insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
values
  ('53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 1),
  ('53000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 1),
  ('53000000-0000-4000-8000-000000000003', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000003', 1),
  ('53000000-0000-4000-8000-000000000004', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000004', 1),
  ('53000000-0000-4000-8000-000000000005', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000005', 1),
  ('53000000-0000-4000-8000-000000000006', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000006', 1),
  ('53000000-0000-4000-8000-000000000007', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000007', 1),
  ('53000000-0000-4000-8000-000000000008', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000008', 1),
  ('53000000-0000-4000-8000-000000000013', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000010', 1),
  ('53000000-0000-4000-8000-000000000014', '51000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000009', 1);

do $$
begin
  begin
    insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
    values ('53000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000009', 2);
    raise exception 'Expected cross-tenant product association to fail';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.ejnexa_catalog_campaigns (business_id, name, campaign_kind, promotion_type, percentage_discount)
    values ('51000000-0000-4000-8000-000000000001', 'Invalid percentage', 'promotion', 'percentage', 0);
    raise exception 'Expected invalid percentage to fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.ejnexa_catalog_campaigns (business_id, name, campaign_kind, starts_on, ends_on)
    values ('51000000-0000-4000-8000-000000000001', 'Invalid date range', 'showcase', current_date, current_date - 1);
    raise exception 'Expected invalid date range to fail';
  exception when check_violation then null;
  end;

  begin
    insert into public.ejnexa_catalog_campaigns (business_id, name, campaign_kind, image_path)
    values ('51000000-0000-4000-8000-000000000001', 'Invalid image path', 'showcase', 'other-owner/51000000-0000-4000-8000-000000000001/campaigns/banner.png');
    raise exception 'Expected invalid campaign media path to fail';
  exception when check_violation then null;
  end;

  insert into public.ejnexa_catalog_campaigns (id, business_id, name, campaign_kind, promotion_type, percentage_discount, active, starts_on, ends_on)
  values ('53000000-0000-4000-8000-000000000009', '51000000-0000-4000-8000-000000000001', 'Overlapping promotion', 'promotion', 'percentage', 10, true, current_date + 1, current_date + 4);
  begin
    insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
    values ('53000000-0000-4000-8000-000000000009', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 1);
    raise exception 'Expected overlapping active promotion to fail';
  exception when check_violation then null;
  end;

  insert into public.ejnexa_catalog_campaigns (id, business_id, name, campaign_kind, promotion_type, percentage_discount, active, starts_on, ends_on)
  values ('53000000-0000-4000-8000-000000000010', '51000000-0000-4000-8000-000000000001', 'Draft promotion', 'promotion', 'percentage', 10, false, current_date, current_date + 1);
  insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
  values ('53000000-0000-4000-8000-000000000010', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 1);
  begin
    update public.ejnexa_catalog_campaigns set active = true where id = '53000000-0000-4000-8000-000000000010';
    raise exception 'Expected activation of overlapping promotion to fail';
  exception when check_violation then null;
  end;

  insert into public.ejnexa_catalog_campaigns (id, business_id, name, campaign_kind, promotion_type, promo_price, active, starts_on, ends_on)
  values ('53000000-0000-4000-8000-000000000011', '51000000-0000-4000-8000-000000000001', 'Non-overlapping future promotion', 'promotion', 'fixed_price', 900, true, current_date + 3, current_date + 5);
  insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
  values ('53000000-0000-4000-8000-000000000011', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 1);

  insert into public.ejnexa_catalog_campaigns (id, business_id, name, campaign_kind, active, starts_on, ends_on)
  values ('53000000-0000-4000-8000-000000000012', '51000000-0000-4000-8000-000000000001', 'Editorial showcase may overlap', 'showcase', true, current_date, current_date + 2);
  insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
  values ('53000000-0000-4000-8000-000000000012', '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 1);
end;
$$;

do $$
declare
  v_row record;
  v_profile record;
begin
  if has_table_privilege('anon', 'public.ejnexa_catalog_campaigns', 'SELECT')
     or has_table_privilege('anon', 'public.ejnexa_catalog_campaign_products', 'SELECT') then
    raise exception 'Anon can directly access campaign tables';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ejnexa_catalog_campaigns'::regclass)
     or not (select relrowsecurity from pg_class where oid = 'public.ejnexa_catalog_campaign_products'::regclass) then
    raise exception 'RLS is not enabled on campaign tables';
  end if;
  if not has_function_privilege('anon', 'public.ejnexa_get_public_catalog_products(text)', 'EXECUTE') then
    raise exception 'Public catalog RPC is missing anon EXECUTE';
  end if;
  if (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Catalog owners can upload marketing media',
        'Catalog owners can select marketing media',
        'Catalog owners can delete marketing media'
      )
      and coalesce(qual, '') || coalesce(with_check, '') like '%campaigns%'
  ) <> 3 then
    raise exception 'Campaign media policies are missing or do not validate the campaigns folder';
  end if;

  select * into v_row from public.ejnexa_get_public_catalog_products('campaign-test-arpe') where id = '52000000-0000-4000-8000-000000000001';
  if v_row.name <> 'Cupcakes' or v_row.category <> 'Cupcakes' or v_row.unit_label <> 'docena'
     or v_row.default_unit_price <> 750 or v_row.base_price <> 1000 or v_row.promotional_price <> 750
     or v_row.promotion_type <> 'percentage' or v_row.promotion_badge <> '25% OFF' then
    raise exception 'Percentage promotion was not server-resolved';
  end if;
  select * into v_row from public.ejnexa_get_public_catalog_products('campaign-test-arpe') where id = '52000000-0000-4000-8000-000000000002';
  if v_row.default_unit_price <> 875 or v_row.promotional_price <> 875 or v_row.promotion_type <> 'fixed_discount' then
    raise exception 'Fixed discount promotion was not server-resolved';
  end if;
  select * into v_row from public.ejnexa_get_public_catalog_products('campaign-test-arpe') where id = '52000000-0000-4000-8000-000000000003';
  if v_row.default_unit_price <> 700 or v_row.promotional_price <> 700 or v_row.promotion_type <> 'fixed_price' then
    raise exception 'Fixed price promotion was not server-resolved';
  end if;
  select * into v_row from public.ejnexa_get_public_catalog_products('campaign-test-arpe') where id = '52000000-0000-4000-8000-000000000004';
  if v_row.default_unit_price <> 1000 or v_row.promotional_price is not null or v_row.promotion_type <> 'two_for_one' then
    raise exception 'Two-for-one was incorrectly converted to a unit discount';
  end if;
  select * into v_row from public.ejnexa_get_public_catalog_products('campaign-test-arpe') where id = '52000000-0000-4000-8000-000000000010';
  if v_row.default_unit_price <> 1000 or v_row.promotional_price is not null or v_row.promotion_type <> 'combo' then
    raise exception 'Combo schema was treated as a calculated discount';
  end if;
  select * into v_row from public.ejnexa_get_public_catalog_products('campaign-test-arpe') where id = '52000000-0000-4000-8000-000000000005';
  if v_row.default_unit_price <> 1000 or v_row.campaign_kind <> 'showcase' or v_row.promotion_type is not null then
    raise exception 'Showcase changed the product price';
  end if;
  select * into v_row from public.ejnexa_get_public_catalog_products('campaign-test-arpe') where id = '52000000-0000-4000-8000-000000000006';
  if v_row.default_unit_price is not null or v_row.base_price is not null or v_row.promotional_price is not null or v_row.campaign_id is not null then
    raise exception 'Contact price exposed a monetary promotion';
  end if;
  if exists (select 1 from public.ejnexa_get_public_catalog_products('campaign-test-arpe') p where p.id in ('52000000-0000-4000-8000-000000000007', '52000000-0000-4000-8000-000000000008') and p.campaign_id is not null) then
    raise exception 'Expired or future campaign was exposed as active';
  end if;
  if exists (select 1 from public.ejnexa_get_public_catalog_products('campaign-test-arpe') p where p.id = '52000000-0000-4000-8000-000000000009') then
    raise exception 'Catalog RPC mixed another business catalog';
  end if;
  select * into v_profile from public.ejnexa_get_public_catalog_profile('campaign-test-arpe');
  if v_profile.name <> 'ARPE test fixture — pastelería' or v_profile.currency <> 'NIO' then
    raise exception 'Pastry fixture profile or currency was not preserved';
  end if;
  select * into v_profile from public.ejnexa_get_public_catalog_profile('campaign-test-retail');
  if v_profile.name <> 'Retail fixture B — tienda de zapatos' or v_profile.currency <> 'USD' then
    raise exception 'Retail fixture profile or independent currency was not preserved';
  end if;
  select * into v_row from public.ejnexa_get_public_catalog_products('campaign-test-retail') where id = '52000000-0000-4000-8000-000000000009';
  if v_row.name <> 'Zapatos' or v_row.category <> 'Zapatos' or v_row.default_unit_price <> 50
     or v_row.promotion_type <> 'two_for_one' or v_row.promotional_price is not null then
    raise exception 'Retail category or 2x1 campaign leaked or changed into a monetary discount';
  end if;
end;
$$;

set local role anon;
do $$
declare
  v_id uuid;
begin
  begin
    perform 1 from public.ejnexa_catalog_campaigns;
    raise exception 'Anon direct campaign table read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  select id into v_id from public.ejnexa_get_public_catalog_products('campaign-test-arpe') where id = '52000000-0000-4000-8000-000000000001';
  if v_id is null then raise exception 'Anon could not use the public catalog RPC'; end if;

  perform 1 from public.ejnexa_submit_catalog_request(
    'campaign-test-arpe', '54000000-0000-4000-8000-000000000001', 'Test Customer', '', null, '',
    jsonb_build_array(jsonb_build_object(
      'product_id', '52000000-0000-4000-8000-000000000001', 'quantity', 2,
      'promotion_type', 'fixed_price', 'promo_price', 1, 'discount', 999
    ))
  );
end;
$$;
reset role;

do $$
declare
  v_item public.arpe_catalog_request_items;
begin
  select * into v_item from public.arpe_catalog_request_items
  where request_id = (select id from public.arpe_catalog_requests where client_request_key = '54000000-0000-4000-8000-000000000001');
  if v_item.quantity <> 2 or v_item.public_unit_price_snapshot <> 750
     or v_item.base_unit_price_snapshot <> 1000 or v_item.promotional_unit_price_snapshot <> 750
     or v_item.promotion_type_snapshot <> 'percentage'
     or v_item.campaign_id_snapshot <> '53000000-0000-4000-8000-000000000001' then
    raise exception 'Request did not preserve the server-resolved promotion snapshot';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
do $$
declare
  v_own_count integer;
  v_other_count integer;
begin
  select count(*) into v_own_count from public.ejnexa_catalog_campaigns where business_id = '51000000-0000-4000-8000-000000000001';
  select count(*) into v_other_count from public.ejnexa_catalog_campaigns where business_id = '51000000-0000-4000-8000-000000000002';
  if v_own_count < 8 or v_other_count <> 0 then raise exception 'Campaign owner RLS isolation failed'; end if;

  insert into public.ejnexa_catalog_campaigns (business_id, name, campaign_kind)
  values ('51000000-0000-4000-8000-000000000001', 'Owner-created showcase', 'showcase');

  begin
    insert into public.ejnexa_catalog_campaigns (business_id, name, campaign_kind)
    values ('51000000-0000-4000-8000-000000000002', 'Cross-tenant showcase', 'showcase');
    raise exception 'Cross-tenant campaign insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

rollback;
