begin;

-- Authenticated callers enter through public RPCs. The private SECURITY DEFINER
-- functions perform the transaction after explicit auth.uid() ownership checks.
grant usage on schema private to authenticated;

create function private.ejnexa_save_catalog_campaign(
  p_campaign_id uuid,
  p_business_id uuid,
  p_name text,
  p_description text,
  p_campaign_kind text,
  p_promotion_type text,
  p_percentage_discount numeric,
  p_fixed_discount numeric,
  p_promo_price numeric,
  p_badge_text text,
  p_image_path text,
  p_starts_on date,
  p_ends_on date,
  p_active boolean,
  p_featured boolean,
  p_sort_order integer,
  p_product_ids uuid[]
)
returns setof public.ejnexa_catalog_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner_id uuid;
  v_campaign public.ejnexa_catalog_campaigns;
  v_product_count integer;
  v_distinct_product_count integer;
  v_min_product_price numeric;
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := coalesce(p_description, '');
  v_badge_text text := nullif(btrim(coalesce(p_badge_text, '')), '');
  v_active boolean := coalesce(p_active, false);
begin
  if v_user_id is null then
    raise exception 'Not authorized to manage this campaign' using errcode = '42501';
  end if;

  select b.owner_id into v_owner_id
  from public.arpe_businesses b
  where b.id = p_business_id;

  if v_owner_id is distinct from v_user_id then
    raise exception 'Not authorized to manage this campaign' using errcode = '42501';
  end if;

  if v_name = '' or char_length(v_name) > 120
    or char_length(v_description) > 1000
    or (v_badge_text is not null and char_length(v_badge_text) > 60)
    or (p_starts_on is not null and p_ends_on is not null and p_ends_on < p_starts_on)
    or coalesce(p_sort_order, -1) < 0 then
    raise exception 'Invalid campaign details' using errcode = '23514';
  end if;

  if p_campaign_kind is null or p_campaign_kind not in ('promotion', 'showcase') then
    raise exception 'Unsupported campaign kind' using errcode = '23514';
  end if;

  if coalesce(cardinality(p_product_ids), 0) = 0
    or array_position(p_product_ids, null) is not null then
    raise exception 'Select at least one valid product' using errcode = '23514';
  end if;

  select count(*), count(distinct selected.product_id)
  into v_product_count, v_distinct_product_count
  from unnest(p_product_ids) as selected(product_id);

  if v_product_count <> v_distinct_product_count then
    raise exception 'Campaign products must not contain duplicates' using errcode = '23514';
  end if;

  select count(*), min(p.default_unit_price)
  into v_product_count, v_min_product_price
  from public.arpe_catalog_products p
  where p.business_id = p_business_id
    and p.id = any(p_product_ids);

  if v_product_count <> cardinality(p_product_ids) then
    raise exception 'Every selected product must belong to this business' using errcode = '42501';
  end if;

  if p_campaign_kind = 'showcase' then
    if p_promotion_type is not null
      or p_percentage_discount is not null
      or p_fixed_discount is not null
      or p_promo_price is not null then
      raise exception 'Showcase campaigns cannot change product prices' using errcode = '23514';
    end if;
  else
    if p_promotion_type = 'combo' then
      raise exception 'Combo campaigns are not available yet' using errcode = '23514';
    end if;

    if p_promotion_type is null or p_promotion_type not in ('percentage', 'fixed_discount', 'fixed_price', 'two_for_one') then
      raise exception 'Unsupported promotion type' using errcode = '23514';
    end if;

    if p_promotion_type in ('percentage', 'fixed_discount', 'fixed_price')
      and exists (
        select 1 from public.arpe_catalog_products p
        where p.business_id = p_business_id
          and p.id = any(p_product_ids)
          and p.public_price_mode = 'contact'
      ) then
      raise exception 'Products with contact pricing cannot have monetary promotions' using errcode = '23514';
    end if;

    if p_promotion_type = 'percentage' then
      if p_percentage_discount is null
        or p_percentage_discount <= 0
        or p_percentage_discount > 100
        or round(p_percentage_discount, 2) <> p_percentage_discount
        or p_fixed_discount is not null
        or p_promo_price is not null then
        raise exception 'Percentage discount must be greater than 0, at most 100, and use up to 2 decimals' using errcode = '23514';
      end if;
    elsif p_promotion_type = 'fixed_discount' then
      if p_fixed_discount is null or p_fixed_discount <= 0
        or round(p_fixed_discount, 2) <> p_fixed_discount
        or p_percentage_discount is not null
        or p_promo_price is not null
        or exists (
          select 1 from public.arpe_catalog_products p
          where p.business_id = p_business_id
            and p.id = any(p_product_ids)
            and p.default_unit_price < p_fixed_discount
        ) then
        raise exception 'Fixed discount cannot exceed any selected product price' using errcode = '23514';
      end if;
    elsif p_promotion_type = 'fixed_price' then
      if p_promo_price is null or p_promo_price < 0
        or round(p_promo_price, 2) <> p_promo_price
        or p_promo_price > v_min_product_price
        or p_percentage_discount is not null
        or p_fixed_discount is not null then
        raise exception 'Special price cannot exceed the usual price of any selected product' using errcode = '23514';
      end if;
    elsif p_promotion_type = 'two_for_one' then
      if p_percentage_discount is not null or p_fixed_discount is not null or p_promo_price is not null then
        raise exception '2x1 campaigns do not accept monetary values' using errcode = '23514';
      end if;
    end if;
  end if;

  if p_campaign_id is null then
    insert into public.ejnexa_catalog_campaigns (
      business_id, name, description, campaign_kind, promotion_type,
      percentage_discount, fixed_discount, promo_price, badge_text,
      image_path, starts_on, ends_on, active, featured, sort_order
    ) values (
      p_business_id, v_name, v_description, p_campaign_kind, p_promotion_type,
      p_percentage_discount, p_fixed_discount, p_promo_price, v_badge_text,
      p_image_path, p_starts_on, p_ends_on, false, coalesce(p_featured, false), coalesce(p_sort_order, 0)
    ) returning * into v_campaign;
  else
    select c.* into v_campaign
    from public.ejnexa_catalog_campaigns c
    where c.id = p_campaign_id and c.business_id = p_business_id
    for update;

    if not found then
      raise exception 'Not authorized to manage this campaign' using errcode = '42501';
    end if;

    update public.ejnexa_catalog_campaigns c
    set active = false
    where c.id = p_campaign_id and c.business_id = p_business_id;

    update public.ejnexa_catalog_campaigns c
    set name = v_name,
        description = v_description,
        campaign_kind = p_campaign_kind,
        promotion_type = p_promotion_type,
        percentage_discount = p_percentage_discount,
        fixed_discount = p_fixed_discount,
        promo_price = p_promo_price,
        badge_text = v_badge_text,
        image_path = p_image_path,
        starts_on = p_starts_on,
        ends_on = p_ends_on,
        active = false,
        featured = coalesce(p_featured, false),
        sort_order = coalesce(p_sort_order, 0)
    where c.id = p_campaign_id and c.business_id = p_business_id
    returning * into v_campaign;
  end if;

  delete from public.ejnexa_catalog_campaign_products cp
  where cp.campaign_id = v_campaign.id and cp.business_id = p_business_id;

  insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
  select v_campaign.id, p_business_id, selected.product_id, selected.ordinality::integer
  from unnest(p_product_ids) with ordinality as selected(product_id, ordinality);

  if v_active then
    update public.ejnexa_catalog_campaigns c
    set active = true
    where c.id = v_campaign.id and c.business_id = p_business_id
    returning * into v_campaign;
  else
    select c.* into v_campaign
    from public.ejnexa_catalog_campaigns c
    where c.id = v_campaign.id and c.business_id = p_business_id;
  end if;

  return next v_campaign;
  return;
end;
$$;

create function public.ejnexa_save_catalog_campaign(
  p_campaign_id uuid,
  p_business_id uuid,
  p_name text,
  p_description text,
  p_campaign_kind text,
  p_promotion_type text,
  p_percentage_discount numeric,
  p_fixed_discount numeric,
  p_promo_price numeric,
  p_badge_text text,
  p_image_path text,
  p_starts_on date,
  p_ends_on date,
  p_active boolean,
  p_featured boolean,
  p_sort_order integer,
  p_product_ids uuid[]
)
returns setof public.ejnexa_catalog_campaigns
language sql
security invoker
set search_path = ''
as $$
  select * from private.ejnexa_save_catalog_campaign(
    p_campaign_id, p_business_id, p_name, p_description, p_campaign_kind,
    p_promotion_type, p_percentage_discount, p_fixed_discount, p_promo_price,
    p_badge_text, p_image_path, p_starts_on, p_ends_on, p_active, p_featured,
    p_sort_order, p_product_ids
  );
$$;

create function private.ejnexa_set_catalog_campaign_active(
  p_business_id uuid,
  p_campaign_id uuid,
  p_active boolean
)
returns setof public.ejnexa_catalog_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_campaign public.ejnexa_catalog_campaigns;
begin
  if auth.uid() is null then
    raise exception 'Not authorized to manage this campaign' using errcode = '42501';
  end if;

  select b.owner_id into v_owner_id
  from public.arpe_businesses b
  where b.id = p_business_id;

  if v_owner_id is distinct from auth.uid() then
    raise exception 'Not authorized to manage this campaign' using errcode = '42501';
  end if;

  update public.ejnexa_catalog_campaigns c
  set active = coalesce(p_active, false)
  where c.id = p_campaign_id and c.business_id = p_business_id
  returning * into v_campaign;

  if not found then
    raise exception 'Not authorized to manage this campaign' using errcode = '42501';
  end if;

  return next v_campaign;
  return;
end;
$$;

create function public.ejnexa_set_catalog_campaign_active(
  p_business_id uuid,
  p_campaign_id uuid,
  p_active boolean
)
returns setof public.ejnexa_catalog_campaigns
language sql
security invoker
set search_path = ''
as $$
  select * from private.ejnexa_set_catalog_campaign_active(p_business_id, p_campaign_id, p_active);
$$;

revoke all on function private.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) from public, anon, authenticated;
revoke all on function private.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function private.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) to authenticated;
grant execute on function private.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) to authenticated;

revoke all on function public.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) to authenticated;
grant execute on function public.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) to authenticated;

revoke insert, update, delete on table public.ejnexa_catalog_campaigns, public.ejnexa_catalog_campaign_products from authenticated;

comment on function public.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) is 'Atomically creates or updates a tenant-owned campaign and its product links; only authenticated owners may execute.';
comment on function public.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) is 'Atomically activates or deactivates a tenant-owned campaign; only authenticated owners may execute.';

notify pgrst, 'reload schema';

commit;
