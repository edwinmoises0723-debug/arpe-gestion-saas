-- EJNEXA Business Staging only. This focused lifecycle suite rolls back every fixture.
begin;

insert into auth.users (id, email) values
  ('56000000-0000-4000-8000-000000000001', 'lifecycle-owner-a@example.test'),
  ('56000000-0000-4000-8000-000000000002', 'lifecycle-owner-b@example.test');

insert into public.arpe_businesses (id, owner_id, name, catalog_slug, public_catalog_enabled, currency)
values
  ('57000000-0000-4000-8000-000000000001', '56000000-0000-4000-8000-000000000001', 'Lifecycle fixture A', 'lifecycle-test-a', true, 'NIO'),
  ('57000000-0000-4000-8000-000000000002', '56000000-0000-4000-8000-000000000002', 'Lifecycle fixture B', 'lifecycle-test-b', true, 'USD');

insert into public.arpe_catalog_products (
  id, business_id, name, category, unit_label, default_unit_price, is_active, is_public, public_price_mode
) values
  ('58000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'Producto A', 'General', 'unidad', 100, true, true, 'exact'),
  ('58000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000002', 'Producto B', 'General', 'unidad', 200, true, true, 'exact');

insert into public.ejnexa_catalog_campaigns (
  id, business_id, name, description, campaign_kind, promotion_type, percentage_discount,
  badge_text, image_path, starts_on, ends_on, active, featured, sort_order, archived_at
) values
  ('59000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', 'Campaña original', 'Descripción conservada', 'promotion', 'percentage', 20,
    '20% OFF', '56000000-0000-4000-8000-000000000001/57000000-0000-4000-8000-000000000001/campaigns/shared.png', current_date, current_date + 3, true, true, 4, null),
  ('59000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000001', 'Campaña histórica', '', 'promotion', 'percentage', 10,
    '10% OFF', null, current_date, current_date + 1, false, false, 5, now()),
  ('59000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000001', 'Campaña sin historial', '', 'showcase', null, null,
    'Nuevo', null, null, null, false, false, 6, now()),
  ('59000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-000000000002', 'Campaña de otro negocio', '', 'promotion', 'percentage', 15,
    '15% OFF', null, current_date, current_date + 1, false, false, 1, now());

insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
values
  ('59000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000001', 1),
  ('59000000-0000-4000-8000-000000000002', '57000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000001', 1),
  ('59000000-0000-4000-8000-000000000003', '57000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000001', 1),
  ('59000000-0000-4000-8000-000000000004', '57000000-0000-4000-8000-000000000002', '58000000-0000-4000-8000-000000000002', 1);

insert into public.arpe_catalog_requests (
  id, business_id, request_number, client_request_key, customer_name, customer_phone, desired_date, details
) values (
  '61000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001',
  'ARPE-SOL-2026-9001', '62000000-0000-4000-8000-000000000001', 'Cliente histórico', '', null, ''
);

insert into public.arpe_catalog_request_items (
  id, request_id, business_id, catalog_product_id, position, product_name_snapshot, category_snapshot,
  quantity, unit_label_snapshot, public_price_mode_snapshot, public_unit_price_snapshot,
  campaign_id_snapshot, campaign_name_snapshot, campaign_kind_snapshot, promotion_type_snapshot,
  promotion_badge_snapshot, base_unit_price_snapshot, promotional_unit_price_snapshot
) values (
  '63000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
  '57000000-0000-4000-8000-000000000001', '58000000-0000-4000-8000-000000000001', 1,
  'Producto A', 'General', 1, 'unidad', 'exact', 80,
  '59000000-0000-4000-8000-000000000002', 'Campaña histórica', 'promotion', 'percentage',
  '10% OFF', 100, 80
);

do $$
begin
  if has_function_privilege('anon', 'public.ejnexa_duplicate_catalog_campaign(uuid, uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.ejnexa_archive_catalog_campaign(uuid, uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.ejnexa_restore_catalog_campaign(uuid, uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.ejnexa_delete_catalog_campaign(uuid, uuid)', 'EXECUTE') then
    raise exception 'Anonymous role can execute a campaign lifecycle RPC';
  end if;
  if not has_function_privilege('authenticated', 'public.ejnexa_duplicate_catalog_campaign(uuid, uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.ejnexa_archive_catalog_campaign(uuid, uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.ejnexa_restore_catalog_campaign(uuid, uuid)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.ejnexa_delete_catalog_campaign(uuid, uuid)', 'EXECUTE') then
    raise exception 'Authenticated lifecycle RPC grants are incomplete';
  end if;
  if has_function_privilege('authenticated', 'private.ejnexa_duplicate_catalog_campaign(uuid, uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'private.ejnexa_delete_catalog_campaign(uuid, uuid)', 'EXECUTE') then
    raise exception 'A private campaign lifecycle function is executable by a client role';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.ejnexa_catalog_campaigns'::regclass) then
    raise exception 'Campaign RLS was disabled';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '56000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  v_campaign public.ejnexa_catalog_campaigns;
  v_copy public.ejnexa_catalog_campaigns;
  v_new public.ejnexa_catalog_campaigns;
  v_public record;
  v_count integer;
begin
  -- Duplicate preserves campaign configuration, date basis, image reference, and tenant products.
  select * into v_copy from public.ejnexa_duplicate_catalog_campaign(
    '57000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001'
  );
  if v_copy.id = '59000000-0000-4000-8000-000000000001'
    or v_copy.business_id <> '57000000-0000-4000-8000-000000000001'
    or v_copy.name <> 'Copia de Campaña original'
    or v_copy.active is true or v_copy.archived_at is not null
    or v_copy.description <> 'Descripción conservada' or v_copy.badge_text <> '20% OFF'
    or v_copy.image_path is distinct from '56000000-0000-4000-8000-000000000001/57000000-0000-4000-8000-000000000001/campaigns/shared.png'
    or v_copy.starts_on is distinct from current_date or v_copy.ends_on is distinct from current_date + 3
    or v_copy.featured is not true or v_copy.percentage_discount <> 20 then
    raise exception 'Duplicate did not preserve its expected fields as an inactive tenant copy';
  end if;
  select count(*) into v_count from public.ejnexa_catalog_campaign_products cp
  where cp.campaign_id = v_copy.id and cp.business_id = v_copy.business_id and cp.product_id = '58000000-0000-4000-8000-000000000001';
  if v_count <> 1 then raise exception 'Duplicate did not copy valid campaign product associations'; end if;

  -- Active campaigns must first be archived before a permanent delete.
  begin
    perform public.ejnexa_delete_catalog_campaign('57000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001');
    raise exception 'Active campaign deletion unexpectedly succeeded';
  exception when sqlstate '23514' then
    if sqlerrm <> 'Archive the campaign before deleting it' then raise; end if;
  end;

  select * into v_campaign from public.ejnexa_archive_catalog_campaign(
    '57000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001'
  );
  if v_campaign.active is true or v_campaign.archived_at is null then raise exception 'Archive did not disable and timestamp campaign'; end if;
  select * into v_public from public.ejnexa_get_public_catalog_products('lifecycle-test-a') p
  where p.id = '58000000-0000-4000-8000-000000000001';
  if v_public.id is null or v_public.campaign_id = '59000000-0000-4000-8000-000000000001'
    or v_public.campaign_kind is not null then
    raise exception 'Archived campaign remained visible in public catalog resolution';
  end if;
  begin
    perform * from public.ejnexa_submit_catalog_request(
      'lifecycle-test-a', '64000000-0000-4000-8000-000000000001', 'Cliente de prueba', '', null, '',
      jsonb_build_array(jsonb_build_object(
        'product_id', '58000000-0000-4000-8000-000000000001', 'quantity', 1,
        'expected_campaign_id', '59000000-0000-4000-8000-000000000001', 'expected_public_unit_price', 80
      ))
    );
    raise exception 'A stale public request unexpectedly used an archived campaign';
  exception when others then
    if sqlerrm <> 'La promoción cambió. Actualiza el catálogo e inténtalo nuevamente.' then raise; end if;
  end;
  if exists (select 1 from public.arpe_catalog_requests where client_request_key = '64000000-0000-4000-8000-000000000001') then
    raise exception 'Rejected stale request left a persisted request fixture';
  end if;

  begin
    perform * from public.ejnexa_set_catalog_campaign_active(
      '57000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001', true
    );
    raise exception 'Archived campaign activation unexpectedly succeeded';
  exception when sqlstate '23514' then
    if sqlerrm <> 'EJNEXA_CAMPAIGN_ARCHIVED_RESTORE_FIRST' then raise; end if;
  end;

  begin
    perform * from public.ejnexa_save_catalog_campaign(
      '59000000-0000-4000-8000-000000000001', '57000000-0000-4000-8000-000000000001',
      'No editar archivada', '', 'promotion', 'percentage', 20, null, null, '20% OFF', null,
      current_date, current_date + 3, false, true, 4, array['58000000-0000-4000-8000-000000000001'::uuid]
    );
    raise exception 'Archived campaign editing unexpectedly succeeded';
  exception when sqlstate '23514' then
    if sqlerrm <> 'EJNEXA_CAMPAIGN_ARCHIVED_RESTORE_FIRST' then raise; end if;
  end;

  -- Restoring never activates; a new overlapping offer can be activated after archive.
  select * into v_campaign from public.ejnexa_restore_catalog_campaign(
    '57000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000001'
  );
  if v_campaign.archived_at is not null or v_campaign.active is true then raise exception 'Restore unexpectedly published campaign'; end if;
  select * into v_new from public.ejnexa_save_catalog_campaign(
    null, '57000000-0000-4000-8000-000000000001', 'Oferta tras archivar', '',
    'promotion', 'percentage', 5, null, null, '5% OFF', null,
    current_date, current_date + 3, true, false, 7, array['58000000-0000-4000-8000-000000000001'::uuid]
  );
  if v_new.active is not true or v_new.archived_at is not null then raise exception 'A new active campaign could not use a product freed by archiving'; end if;

  -- Owner A cannot duplicate, archive, restore, or delete Owner B's campaign.
  begin
    perform * from public.ejnexa_duplicate_catalog_campaign('57000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000004');
    raise exception 'Cross-tenant duplicate unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.ejnexa_archive_catalog_campaign('57000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000004');
    raise exception 'Cross-tenant archive unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.ejnexa_restore_catalog_campaign('57000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000004');
    raise exception 'Cross-tenant restore unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.ejnexa_delete_catalog_campaign('57000000-0000-4000-8000-000000000002', '59000000-0000-4000-8000-000000000004');
    raise exception 'Cross-tenant delete unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  -- Historical snapshots protect the campaign; unused archived campaigns are deletable with cascading links.
  begin
    perform public.ejnexa_delete_catalog_campaign('57000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000002');
    raise exception 'Historical campaign deletion unexpectedly succeeded';
  exception when sqlstate '23503' then
    if sqlerrm <> 'EJNEXA_CAMPAIGN_HAS_HISTORY' then raise; end if;
  end;
  if not exists (select 1 from public.ejnexa_catalog_campaigns where id = '59000000-0000-4000-8000-000000000002' and archived_at is not null)
    or not exists (select 1 from public.arpe_catalog_request_items where id = '63000000-0000-4000-8000-000000000001' and campaign_id_snapshot = '59000000-0000-4000-8000-000000000002') then
    raise exception 'Historical campaign or request snapshot changed after refused delete';
  end if;
  if public.ejnexa_delete_catalog_campaign('57000000-0000-4000-8000-000000000001', '59000000-0000-4000-8000-000000000003') is not true then
    raise exception 'Unused archived campaign delete did not return true';
  end if;
  if exists (select 1 from public.ejnexa_catalog_campaigns where id = '59000000-0000-4000-8000-000000000003') then
    raise exception 'Unused archived campaign row still exists after delete';
  end if;
  if exists (select 1 from public.ejnexa_catalog_campaign_products where campaign_id = '59000000-0000-4000-8000-000000000003') then
    raise exception 'Unused archived campaign product links remain after cascading delete';
  end if;
end;
$$;

reset role;
do $$
begin
  if not exists (select 1 from public.ejnexa_catalog_campaigns where id = '59000000-0000-4000-8000-000000000004') then
    raise exception 'Cross-tenant attempt changed the other business campaign';
  end if;
end;
$$;
rollback;
