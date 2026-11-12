begin;

create function private.ejnexa_resolve_catalog_product_offer(
  p_business_id uuid,
  p_product_id uuid
)
returns table (
  product_id uuid,
  product_name text,
  category text,
  product_description text,
  unit_label text,
  default_portions integer,
  is_active boolean,
  is_public boolean,
  public_price_mode text,
  campaign_id uuid,
  campaign_name text,
  campaign_kind text,
  promotion_type text,
  promotion_badge text,
  campaign_description text,
  campaign_image_path text,
  campaign_featured boolean,
  base_price numeric,
  public_price numeric,
  promotional_price numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.name,
    p.category,
    p.description,
    p.unit_label,
    p.default_portions,
    p.is_active,
    p.is_public,
    p.public_price_mode,
    c.id,
    c.name,
    c.campaign_kind,
    c.promotion_type,
    coalesce(c.badge_text, case c.promotion_type
      when 'percentage' then trim(trailing '.' from trim(trailing '0' from c.percentage_discount::text)) || '% OFF'
      when 'fixed_discount' then 'Oferta'
      when 'fixed_price' then 'Precio especial'
      when 'two_for_one' then '2x1'
      when 'combo' then 'Combo'
      else null
    end),
    c.description,
    c.image_path,
    c.featured,
    base.base_price,
    case
      when p.public_price_mode = 'contact' then null::numeric
      when c.promotion_type in ('percentage', 'fixed_discount', 'fixed_price') then prices.promotional_price
      else base.base_price
    end,
    prices.promotional_price
  from public.arpe_catalog_products p
  left join lateral (
    select campaign.*
    from public.ejnexa_catalog_campaign_products cp
    join public.ejnexa_catalog_campaigns campaign
      on campaign.id = cp.campaign_id and campaign.business_id = cp.business_id
    where cp.product_id = p.id
      and cp.business_id = p.business_id
      and campaign.active = true
      and (campaign.starts_on is null or campaign.starts_on <= current_date)
      and (campaign.ends_on is null or campaign.ends_on >= current_date)
      and not (
        p.public_price_mode = 'contact'
        and campaign.campaign_kind = 'promotion'
        and campaign.promotion_type in ('percentage', 'fixed_discount', 'fixed_price')
      )
    order by case when campaign.campaign_kind = 'promotion' then 0 else 1 end,
      campaign.featured desc, campaign.sort_order, campaign.created_at desc
    limit 1
  ) c on true
  cross join lateral (
    select case when p.public_price_mode = 'contact' then null::numeric else p.default_unit_price end as base_price
  ) base
  cross join lateral (
    select case
      when p.public_price_mode = 'contact' then null::numeric
      when c.promotion_type = 'percentage' then greatest(0::numeric, round(p.default_unit_price * (100 - c.percentage_discount) / 100, 2))
      when c.promotion_type = 'fixed_discount' then greatest(0::numeric, round(p.default_unit_price - c.fixed_discount, 2))
      when c.promotion_type = 'fixed_price' then c.promo_price
      else null::numeric
    end as promotional_price
  ) prices
  where p.business_id = p_business_id
    and p.id = p_product_id;
$$;
revoke all on function private.ejnexa_resolve_catalog_product_offer(uuid, uuid) from public, anon, authenticated;

create or replace function public.ejnexa_get_public_catalog_products(p_slug text)
returns table (
  id uuid,
  name text,
  category text,
  description text,
  unit_label text,
  default_unit_price numeric,
  default_portions integer,
  image_path text,
  public_price_mode text,
  public_sort_order integer,
  campaign_id uuid,
  campaign_kind text,
  promotion_type text,
  promotion_badge text,
  campaign_name text,
  campaign_description text,
  campaign_image_path text,
  campaign_featured boolean,
  base_price numeric,
  promotional_price numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    offer.product_id,
    offer.product_name,
    offer.category,
    offer.product_description,
    offer.unit_label,
    offer.public_price,
    offer.default_portions,
    p.image_path,
    offer.public_price_mode,
    p.public_sort_order,
    offer.campaign_id,
    offer.campaign_kind,
    offer.promotion_type,
    offer.promotion_badge,
    offer.campaign_name,
    offer.campaign_description,
    offer.campaign_image_path,
    offer.campaign_featured,
    offer.base_price,
    offer.promotional_price
  from public.arpe_businesses b
  join public.arpe_catalog_products p on p.business_id = b.id
  cross join lateral private.ejnexa_resolve_catalog_product_offer(p.business_id, p.id) offer
  where b.catalog_slug = p_slug
    and b.public_catalog_enabled = true
    and offer.is_active = true
    and offer.is_public = true
  order by p.public_sort_order asc, offer.product_name asc;
$$;
revoke all on function public.ejnexa_get_public_catalog_products(text) from public, anon, authenticated;
grant execute on function public.ejnexa_get_public_catalog_products(text) to anon, authenticated;

create or replace function public.ejnexa_submit_catalog_request(
  p_slug text,
  p_client_request_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_desired_date date,
  p_details text,
  p_items jsonb
)
returns table (id uuid, request_number text, status text, submitted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
  v_request public.arpe_catalog_requests;
  v_sequence_year integer := extract(year from now())::integer;
  v_sequence_number integer;
  v_item jsonb;
  v_product_id uuid;
  v_product_id_text text;
  v_quantity_text text;
  v_quantity integer;
  v_position integer := 0;
  v_product_ids uuid[] := array[]::uuid[];
  v_offer record;
  v_expected_campaign_id uuid;
  v_expected_public_unit_price numeric;
begin
  select b.id into v_business_id
  from public.arpe_businesses b
  where b.catalog_slug = p_slug and b.public_catalog_enabled = true;
  if not found then raise exception 'Catalog not available'; end if;
  if p_client_request_key is null then raise exception 'Invalid request key'; end if;

  select r.* into v_request
  from public.arpe_catalog_requests r
  where r.business_id = v_business_id and r.client_request_key = p_client_request_key;
  if found then
    return query select v_request.id, v_request.request_number, v_request.status, v_request.submitted_at;
    return;
  end if;

  if p_customer_name is null or char_length(btrim(p_customer_name)) not between 2 and 100 then raise exception 'Customer name must contain 2 to 100 characters'; end if;
  if char_length(coalesce(p_customer_phone, '')) > 30 then raise exception 'Customer phone must contain at most 30 characters'; end if;
  if p_desired_date is not null and p_desired_date < current_date then raise exception 'Desired date cannot be in the past'; end if;
  if char_length(coalesce(p_details, '')) > 1000 then raise exception 'Request details must contain at most 1000 characters'; end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Request items must be an array'; end if;
  if jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Request must contain between 1 and 50 products'; end if;

  insert into private.arpe_catalog_request_sequences (business_id, sequence_year, next_number)
  values (v_business_id, v_sequence_year, 2)
  on conflict (business_id, sequence_year) do update
    set next_number = private.arpe_catalog_request_sequences.next_number + 1
  returning next_number - 1 into v_sequence_number;

  insert into public.arpe_catalog_requests (business_id, request_number, client_request_key, customer_name, customer_phone, desired_date, details)
  values (v_business_id, 'SOL-' || v_sequence_year::text || '-' || lpad(v_sequence_number::text, 4, '0'), p_client_request_key, btrim(p_customer_name), coalesce(p_customer_phone, ''), p_desired_date, coalesce(p_details, ''))
  on conflict (business_id, client_request_key) do nothing
  returning * into v_request;

  if not found then
    select r.* into v_request from public.arpe_catalog_requests r
    where r.business_id = v_business_id and r.client_request_key = p_client_request_key;
    return query select v_request.id, v_request.request_number, v_request.status, v_request.submitted_at;
    return;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as items(value)
  loop
    v_position := v_position + 1;
    if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'Each request item must be an object'; end if;
    if jsonb_typeof(v_item -> 'product_id') is distinct from 'string' then raise exception 'Invalid catalog product'; end if;
    v_product_id_text := v_item ->> 'product_id';
    begin v_product_id := v_product_id_text::uuid;
    exception when invalid_text_representation then raise exception 'Invalid catalog product'; end;
    if v_product_id = any(v_product_ids) then raise exception 'Duplicate catalog product'; end if;
    v_product_ids := array_append(v_product_ids, v_product_id);

    if jsonb_typeof(v_item -> 'quantity') is distinct from 'number' then raise exception 'Quantity must be an integer between 1 and 9999'; end if;
    v_quantity_text := v_item ->> 'quantity';
    if v_quantity_text is null or v_quantity_text !~ '^[1-9][0-9]{0,3}$' then raise exception 'Quantity must be an integer between 1 and 9999'; end if;
    v_quantity := v_quantity_text::integer;

    select offer.* into v_offer
    from private.ejnexa_resolve_catalog_product_offer(v_business_id, v_product_id) offer;
    if not found then raise exception 'Invalid catalog product'; end if;
    if v_offer.is_active is not true or v_offer.is_public is not true then raise exception 'Invalid catalog product'; end if;

    if v_item ? 'expected_campaign_id' then
      if jsonb_typeof(v_item -> 'expected_campaign_id') = 'null' then
        v_expected_campaign_id := null;
      elsif jsonb_typeof(v_item -> 'expected_campaign_id') = 'string' then
        begin v_expected_campaign_id := (v_item ->> 'expected_campaign_id')::uuid;
        exception when invalid_text_representation then
          raise exception using errcode = 'P0001', message = 'La promoción cambió. Actualiza el catálogo e inténtalo nuevamente.';
        end;
      else
        raise exception using errcode = 'P0001', message = 'La promoción cambió. Actualiza el catálogo e inténtalo nuevamente.';
      end if;

      if v_expected_campaign_id is distinct from v_offer.campaign_id then
        raise exception using errcode = 'P0001', message = 'La promoción cambió. Actualiza el catálogo e inténtalo nuevamente.';
      end if;
    end if;

    if v_item ? 'expected_public_unit_price' and v_offer.public_price_mode <> 'contact' then
      if jsonb_typeof(v_item -> 'expected_public_unit_price') = 'null' then
        v_expected_public_unit_price := null;
      elsif jsonb_typeof(v_item -> 'expected_public_unit_price') = 'number' then
        v_expected_public_unit_price := (v_item ->> 'expected_public_unit_price')::numeric;
      else
        raise exception using errcode = 'P0001', message = 'La promoción cambió. Actualiza el catálogo e inténtalo nuevamente.';
      end if;

      if v_expected_public_unit_price is distinct from v_offer.public_price then
        raise exception using errcode = 'P0001', message = 'La promoción cambió. Actualiza el catálogo e inténtalo nuevamente.';
      end if;
    end if;

    insert into public.arpe_catalog_request_items (
      request_id, business_id, catalog_product_id, position, product_name_snapshot, category_snapshot,
      quantity, unit_label_snapshot, default_portions_snapshot, public_price_mode_snapshot,
      public_unit_price_snapshot, campaign_id_snapshot, campaign_name_snapshot, campaign_kind_snapshot,
      promotion_type_snapshot, promotion_badge_snapshot, base_unit_price_snapshot, promotional_unit_price_snapshot
    ) values (
      v_request.id, v_business_id, v_product_id, v_position, v_offer.product_name, v_offer.category,
      v_quantity, v_offer.unit_label, v_offer.default_portions, v_offer.public_price_mode,
      v_offer.public_price, v_offer.campaign_id, v_offer.campaign_name, v_offer.campaign_kind,
      v_offer.promotion_type, v_offer.promotion_badge, v_offer.base_price, v_offer.promotional_price
    );
  end loop;

  return query select v_request.id, v_request.request_number, v_request.status, v_request.submitted_at;
end;
$$;
revoke all on function public.ejnexa_submit_catalog_request(text, uuid, text, text, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.ejnexa_submit_catalog_request(text, uuid, text, text, date, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
