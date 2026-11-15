begin;

-- Keep every active promotion (including a scheduled campaign) compatible with
-- current product prices. Campaign RPCs lock campaign first, then product IDs
-- in ascending order. The product trigger never locks campaigns, avoiding a
-- product-to-campaign lock cycle with these RPCs.

create or replace function private.ejnexa_assert_catalog_campaign_valid(
  p_campaign_id uuid,
  p_override_product_id uuid,
  p_override_price numeric,
  p_override_price_mode text,
  p_check_no_stacking boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.ejnexa_catalog_campaigns;
  v_link_count integer;
  v_product_count integer;
  v_product record;
begin
  select c.* into v_campaign
  from public.ejnexa_catalog_campaigns c
  where c.id = p_campaign_id;

  if not found then
    raise exception 'Campaign does not exist' using errcode = '23514';
  end if;

  select count(*) into v_link_count
  from public.ejnexa_catalog_campaign_products cp
  where cp.campaign_id = v_campaign.id and cp.business_id = v_campaign.business_id;

  select count(*) into v_product_count
  from public.ejnexa_catalog_campaign_products cp
  join public.arpe_catalog_products p
    on p.id = cp.product_id and p.business_id = cp.business_id
  where cp.campaign_id = v_campaign.id and cp.business_id = v_campaign.business_id;

  if v_link_count = 0 or v_product_count <> v_link_count then
    raise exception 'Campaign products are incomplete' using errcode = '23514';
  end if;

  if v_campaign.campaign_kind = 'showcase' then
    if v_campaign.promotion_type is not null
      or v_campaign.percentage_discount is not null
      or v_campaign.fixed_discount is not null
      or v_campaign.promo_price is not null then
      raise exception 'Showcase campaigns cannot change product prices' using errcode = '23514';
    end if;
  elsif v_campaign.campaign_kind = 'promotion' then
    if v_campaign.promotion_type = 'percentage' then
      if v_campaign.percentage_discount is null
        or v_campaign.percentage_discount <= 0
        or v_campaign.percentage_discount > 100
        or round(v_campaign.percentage_discount, 2) <> v_campaign.percentage_discount
        or v_campaign.fixed_discount is not null
        or v_campaign.promo_price is not null then
        raise exception 'Invalid percentage promotion' using errcode = '23514';
      end if;
    elsif v_campaign.promotion_type = 'fixed_discount' then
      if v_campaign.fixed_discount is null
        or v_campaign.fixed_discount <= 0
        or round(v_campaign.fixed_discount, 2) <> v_campaign.fixed_discount
        or v_campaign.percentage_discount is not null
        or v_campaign.promo_price is not null then
        raise exception 'Invalid fixed discount promotion' using errcode = '23514';
      end if;
    elsif v_campaign.promotion_type = 'fixed_price' then
      if v_campaign.promo_price is null
        or v_campaign.promo_price < 0
        or round(v_campaign.promo_price, 2) <> v_campaign.promo_price
        or v_campaign.percentage_discount is not null
        or v_campaign.fixed_discount is not null then
        raise exception 'Invalid fixed price promotion' using errcode = '23514';
      end if;
    elsif v_campaign.promotion_type = 'two_for_one' then
      if v_campaign.percentage_discount is not null
        or v_campaign.fixed_discount is not null
        or v_campaign.promo_price is not null then
        raise exception '2x1 campaigns do not accept monetary values' using errcode = '23514';
      end if;
    elsif v_campaign.promotion_type <> 'combo' or v_campaign.promotion_type is null then
      raise exception 'Unsupported promotion type' using errcode = '23514';
    end if;

    if v_campaign.promotion_type in ('percentage', 'fixed_discount', 'fixed_price') then
      for v_product in
        select p.id,
          case when p.id = p_override_product_id then p_override_price else p.default_unit_price end as effective_price,
          case when p.id = p_override_product_id then p_override_price_mode else p.public_price_mode end as effective_price_mode
        from public.ejnexa_catalog_campaign_products cp
        join public.arpe_catalog_products p
          on p.id = cp.product_id and p.business_id = cp.business_id
        where cp.campaign_id = v_campaign.id and cp.business_id = v_campaign.business_id
        order by p.id
      loop
        if v_product.effective_price is null or v_product.effective_price_mode = 'contact' then
          raise exception 'EJNEXA_CAMPAIGN_PRODUCT_PRICE_INVARIANT' using errcode = '23514';
        end if;
        if v_campaign.promotion_type = 'fixed_discount'
          and v_product.effective_price < v_campaign.fixed_discount then
          raise exception 'EJNEXA_CAMPAIGN_PRODUCT_PRICE_INVARIANT' using errcode = '23514';
        end if;
        if v_campaign.promotion_type = 'fixed_price'
          and v_campaign.promo_price > v_product.effective_price then
          raise exception 'EJNEXA_CAMPAIGN_PRODUCT_PRICE_INVARIANT' using errcode = '23514';
        end if;
      end loop;
    end if;
  else
    raise exception 'Unsupported campaign kind' using errcode = '23514';
  end if;

  if p_check_no_stacking and v_campaign.campaign_kind = 'promotion' and exists (
    select 1
    from public.ejnexa_catalog_campaign_products own_product
    join public.ejnexa_catalog_campaign_products other_product
      on other_product.product_id = own_product.product_id
      and other_product.business_id = own_product.business_id
    join public.ejnexa_catalog_campaigns other_campaign
      on other_campaign.id = other_product.campaign_id
      and other_campaign.business_id = other_product.business_id
    where own_product.campaign_id = v_campaign.id
      and own_product.business_id = v_campaign.business_id
      and other_campaign.id <> v_campaign.id
      and other_campaign.active is true
      and other_campaign.campaign_kind = 'promotion'
      and coalesce(other_campaign.starts_on, '-infinity'::date) <= coalesce(v_campaign.ends_on, 'infinity'::date)
      and coalesce(v_campaign.starts_on, '-infinity'::date) <= coalesce(other_campaign.ends_on, 'infinity'::date)
  ) then
    raise exception 'A product cannot have overlapping active commercial promotions' using errcode = '23514';
  end if;
end;
$$;

create or replace function private.ejnexa_save_catalog_campaign(
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
  v_product_id uuid;
  v_product_count integer;
  v_distinct_product_count integer;
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

  -- Lock existing campaigns before products. This same order is used by activation.
  if p_campaign_id is not null then
    select c.* into v_campaign
    from public.ejnexa_catalog_campaigns c
    where c.id = p_campaign_id and c.business_id = p_business_id
    for update;
    if not found then
      raise exception 'Not authorized to manage this campaign' using errcode = '42501';
    end if;
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

  -- Lock every selected tenant product before price checks or later writes.
  -- Deterministic ordering prevents overlapping multi-product saves deadlocking.
  for v_product_id in
    select p.id
    from public.arpe_catalog_products p
    where p.business_id = p_business_id and p.id = any(p_product_ids)
    order by p.id
    for update
  loop
    null;
  end loop;

  select count(*) into v_product_count
  from public.arpe_catalog_products p
  where p.business_id = p_business_id and p.id = any(p_product_ids);
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

  perform private.ejnexa_assert_catalog_campaign_valid(v_campaign.id, null, null, null, v_active);

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

create or replace function private.ejnexa_set_catalog_campaign_active(
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
  v_product_id uuid;
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

  -- Use the same campaign-then-products order as campaign saves.
  select c.* into v_campaign
  from public.ejnexa_catalog_campaigns c
  where c.id = p_campaign_id and c.business_id = p_business_id
  for update;
  if not found then
    raise exception 'Not authorized to manage this campaign' using errcode = '42501';
  end if;

  if coalesce(p_active, false) then
    for v_product_id in
      select p.id
      from public.ejnexa_catalog_campaign_products cp
      join public.arpe_catalog_products p
        on p.id = cp.product_id and p.business_id = cp.business_id
      where cp.campaign_id = v_campaign.id and cp.business_id = p_business_id
      order by p.id
      for update of p
    loop
      null;
    end loop;

    perform private.ejnexa_assert_catalog_campaign_valid(v_campaign.id, null, null, null, true);
  end if;

  update public.ejnexa_catalog_campaigns c
  set active = coalesce(p_active, false)
  where c.id = p_campaign_id and c.business_id = p_business_id
  returning * into v_campaign;

  return next v_campaign;
  return;
end;
$$;

create or replace function private.ejnexa_guard_catalog_product_campaign_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid;
begin
  if new.default_unit_price is not distinct from old.default_unit_price
    and new.public_price_mode is not distinct from old.public_price_mode then
    return new;
  end if;

  -- Read-only campaign lookup: never lock a campaign from a product update.
  for v_campaign_id in
    select c.id
    from public.ejnexa_catalog_campaign_products cp
    join public.ejnexa_catalog_campaigns c
      on c.id = cp.campaign_id and c.business_id = cp.business_id
    where cp.product_id = old.id
      and cp.business_id = old.business_id
      and c.active is true
      and c.campaign_kind = 'promotion'
      and c.promotion_type in ('percentage', 'fixed_discount', 'fixed_price')
    order by c.id
  loop
    perform private.ejnexa_assert_catalog_campaign_valid(
      v_campaign_id,
      new.id,
      new.default_unit_price,
      new.public_price_mode,
      false
    );
  end loop;

  return new;
end;
$$;

create or replace function public.ejnexa_save_catalog_campaign(
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
security definer
set search_path = ''
as $$
  select * from private.ejnexa_save_catalog_campaign(
    p_campaign_id, p_business_id, p_name, p_description, p_campaign_kind,
    p_promotion_type, p_percentage_discount, p_fixed_discount, p_promo_price,
    p_badge_text, p_image_path, p_starts_on, p_ends_on, p_active, p_featured,
    p_sort_order, p_product_ids
  );
$$;

create or replace function public.ejnexa_set_catalog_campaign_active(
  p_business_id uuid,
  p_campaign_id uuid,
  p_active boolean
)
returns setof public.ejnexa_catalog_campaigns
language sql
security definer
set search_path = ''
as $$
  select * from private.ejnexa_set_catalog_campaign_active(p_business_id, p_campaign_id, p_active);
$$;

revoke all on function private.ejnexa_assert_catalog_campaign_valid(uuid, uuid, numeric, text, boolean) from public, anon, authenticated;
revoke all on function private.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) from public, anon, authenticated;
revoke all on function private.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.ejnexa_guard_catalog_product_campaign_price() from public, anon, authenticated;

revoke all on function public.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) to authenticated;
grant execute on function public.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) to authenticated;

create trigger ejnexa_catalog_product_campaign_price_invariant
  before update of default_unit_price, public_price_mode on public.arpe_catalog_products
  for each row execute function private.ejnexa_guard_catalog_product_campaign_price();

comment on function public.ejnexa_save_catalog_campaign(uuid, uuid, text, text, text, text, numeric, numeric, numeric, text, text, date, date, boolean, boolean, integer, uuid[]) is
  'Authenticated owner entrypoint. SECURITY DEFINER wrapper calls a private owner-validating RPC; direct table writes remain revoked.';
comment on function public.ejnexa_set_catalog_campaign_active(uuid, uuid, boolean) is
  'Authenticated owner entrypoint. SECURITY DEFINER wrapper calls a private owner-validating RPC; direct table writes remain revoked.';
comment on function private.ejnexa_assert_catalog_campaign_valid(uuid, uuid, numeric, text, boolean) is
  'Revalidates campaign prices, contact modes, and optional date-overlap rules against current products.';
comment on function private.ejnexa_guard_catalog_product_campaign_price() is
  'Rejects product price or public-price-mode updates that would invalidate an active scheduled or current monetary promotion.';

notify pgrst, 'reload schema';

commit;
