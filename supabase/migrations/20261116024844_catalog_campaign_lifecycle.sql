begin;

alter table public.ejnexa_catalog_campaigns
  add column archived_at timestamptz;

alter table public.ejnexa_catalog_campaigns
  add constraint ejnexa_catalog_campaigns_archived_inactive_check
  check (archived_at is null or active is false);

create or replace function private.ejnexa_resolve_catalog_product_offer(
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
      and campaign.archived_at is null
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

create or replace function private.ejnexa_assert_catalog_campaign_no_stacking()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_campaign public.ejnexa_catalog_campaigns;
  v_product_id uuid;
begin
  if tg_table_name = 'ejnexa_catalog_campaign_products' then
    select c.* into v_campaign
    from public.ejnexa_catalog_campaigns c
    where c.id = new.campaign_id and c.business_id = new.business_id;

    if not found or v_campaign.archived_at is not null
      or v_campaign.active is not true or v_campaign.campaign_kind <> 'promotion' then
      return new;
    end if;

    perform 1 from public.arpe_catalog_products p
    where p.id = new.product_id and p.business_id = new.business_id
    for update;

    if exists (
      select 1
      from public.ejnexa_catalog_campaign_products cp
      join public.ejnexa_catalog_campaigns c on c.id = cp.campaign_id and c.business_id = cp.business_id
      where cp.product_id = new.product_id
        and cp.business_id = new.business_id
        and cp.campaign_id <> new.campaign_id
        and c.active = true
        and c.archived_at is null
        and c.campaign_kind = 'promotion'
        and coalesce(c.starts_on, '-infinity'::date) <= coalesce(v_campaign.ends_on, 'infinity'::date)
        and coalesce(v_campaign.starts_on, '-infinity'::date) <= coalesce(c.ends_on, 'infinity'::date)
    ) then
      raise exception 'A product cannot have overlapping active commercial promotions' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'ejnexa_catalog_campaigns' then
    if new.active is not true or new.archived_at is not null or new.campaign_kind <> 'promotion' then
      return new;
    end if;

    for v_product_id in
      select cp.product_id
      from public.ejnexa_catalog_campaign_products cp
      where cp.campaign_id = new.id and cp.business_id = new.business_id
      order by cp.product_id
    loop
      perform 1 from public.arpe_catalog_products p
      where p.id = v_product_id and p.business_id = new.business_id
      for update;

      if exists (
        select 1
        from public.ejnexa_catalog_campaign_products cp
        join public.ejnexa_catalog_campaigns c on c.id = cp.campaign_id and c.business_id = cp.business_id
        where cp.product_id = v_product_id
          and cp.business_id = new.business_id
          and cp.campaign_id <> new.id
          and c.active = true
          and c.archived_at is null
          and c.campaign_kind = 'promotion'
          and coalesce(c.starts_on, '-infinity'::date) <= coalesce(new.ends_on, 'infinity'::date)
          and coalesce(new.starts_on, '-infinity'::date) <= coalesce(c.ends_on, 'infinity'::date)
      ) then
        raise exception 'A product cannot have overlapping active commercial promotions' using errcode = '23514';
      end if;
    end loop;
    return new;
  end if;

  raise exception 'Catalog campaign stacking trigger attached to an unsupported table' using errcode = '23514';
end;
$$;

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
      if v_campaign.percentage_discount is null or v_campaign.percentage_discount <= 0
        or v_campaign.percentage_discount > 100 or round(v_campaign.percentage_discount, 2) <> v_campaign.percentage_discount
        or v_campaign.fixed_discount is not null or v_campaign.promo_price is not null then
        raise exception 'Invalid percentage promotion' using errcode = '23514';
      end if;
    elsif v_campaign.promotion_type = 'fixed_discount' then
      if v_campaign.fixed_discount is null or v_campaign.fixed_discount <= 0
        or round(v_campaign.fixed_discount, 2) <> v_campaign.fixed_discount
        or v_campaign.percentage_discount is not null or v_campaign.promo_price is not null then
        raise exception 'Invalid fixed discount promotion' using errcode = '23514';
      end if;
    elsif v_campaign.promotion_type = 'fixed_price' then
      if v_campaign.promo_price is null or v_campaign.promo_price < 0
        or round(v_campaign.promo_price, 2) <> v_campaign.promo_price
        or v_campaign.percentage_discount is not null or v_campaign.fixed_discount is not null then
        raise exception 'Invalid fixed price promotion' using errcode = '23514';
      end if;
    elsif v_campaign.promotion_type = 'two_for_one' then
      if v_campaign.percentage_discount is not null or v_campaign.fixed_discount is not null or v_campaign.promo_price is not null then
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
        join public.arpe_catalog_products p on p.id = cp.product_id and p.business_id = cp.business_id
        where cp.campaign_id = v_campaign.id and cp.business_id = v_campaign.business_id
        order by p.id
      loop
        if v_product.effective_price is null or v_product.effective_price_mode = 'contact' then
          raise exception 'EJNEXA_CAMPAIGN_PRODUCT_PRICE_INVARIANT' using errcode = '23514';
        end if;
        if v_campaign.promotion_type = 'fixed_discount' and v_product.effective_price < v_campaign.fixed_discount then
          raise exception 'EJNEXA_CAMPAIGN_PRODUCT_PRICE_INVARIANT' using errcode = '23514';
        end if;
        if v_campaign.promotion_type = 'fixed_price' and v_campaign.promo_price > v_product.effective_price then
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
      and other_campaign.archived_at is null
      and other_campaign.campaign_kind = 'promotion'
      and coalesce(other_campaign.starts_on, '-infinity'::date) <= coalesce(v_campaign.ends_on, 'infinity'::date)
      and coalesce(v_campaign.starts_on, '-infinity'::date) <= coalesce(other_campaign.ends_on, 'infinity'::date)
  ) then
    raise exception 'A product cannot have overlapping active commercial promotions' using errcode = '23514';
  end if;
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

  for v_campaign_id in
    select c.id
    from public.ejnexa_catalog_campaign_products cp
    join public.ejnexa_catalog_campaigns c
      on c.id = cp.campaign_id and c.business_id = cp.business_id
    where cp.product_id = old.id
      and cp.business_id = old.business_id
      and c.active is true
      and c.archived_at is null
      and c.campaign_kind = 'promotion'
      and c.promotion_type in ('percentage', 'fixed_discount', 'fixed_price')
    order by c.id
  loop
    perform private.ejnexa_assert_catalog_campaign_valid(v_campaign_id, new.id, new.default_unit_price, new.public_price_mode, false);
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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_campaign public.ejnexa_catalog_campaigns;
begin
  if auth.uid() is not null and p_campaign_id is not null then
    select b.owner_id into v_owner_id from public.arpe_businesses b where b.id = p_business_id;
    if v_owner_id = auth.uid() then
      select c.* into v_campaign from public.ejnexa_catalog_campaigns c
      where c.id = p_campaign_id and c.business_id = p_business_id for update;
      if found and v_campaign.archived_at is not null then
        raise exception 'EJNEXA_CAMPAIGN_ARCHIVED_RESTORE_FIRST' using errcode = '23514';
      end if;
    end if;
  end if;
  return query select * from private.ejnexa_save_catalog_campaign(
    p_campaign_id, p_business_id, p_name, p_description, p_campaign_kind, p_promotion_type,
    p_percentage_discount, p_fixed_discount, p_promo_price, p_badge_text, p_image_path,
    p_starts_on, p_ends_on, p_active, p_featured, p_sort_order, p_product_ids
  );
end;
$$;

create or replace function public.ejnexa_set_catalog_campaign_active(p_business_id uuid, p_campaign_id uuid, p_active boolean)
returns setof public.ejnexa_catalog_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.ejnexa_catalog_campaigns;
begin
  if auth.uid() is null then
    raise exception 'Not authorized to manage this campaign' using errcode = '42501';
  end if;
  select c.* into v_campaign
  from public.ejnexa_catalog_campaigns c
  join public.arpe_businesses b on b.id = c.business_id
  where c.id = p_campaign_id and c.business_id = p_business_id and b.owner_id = auth.uid()
  for update of c;
  if not found then
    raise exception 'Not authorized to manage this campaign' using errcode = '42501';
  end if;
  if coalesce(p_active, false) and v_campaign.archived_at is not null then
    raise exception 'EJNEXA_CAMPAIGN_ARCHIVED_RESTORE_FIRST' using errcode = '23514';
  end if;
  return query select * from private.ejnexa_set_catalog_campaign_active(p_business_id, p_campaign_id, p_active);
end;
$$;

create function private.ejnexa_duplicate_catalog_campaign(p_business_id uuid, p_campaign_id uuid)
returns setof public.ejnexa_catalog_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_source public.ejnexa_catalog_campaigns;
  v_copy public.ejnexa_catalog_campaigns;
begin
  if auth.uid() is null then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  select b.owner_id into v_owner_id from public.arpe_businesses b where b.id = p_business_id;
  if v_owner_id is distinct from auth.uid() then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;

  select c.* into v_source from public.ejnexa_catalog_campaigns c
  where c.id = p_campaign_id and c.business_id = p_business_id for update;
  if not found then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.ejnexa_catalog_campaign_products cp
    join public.arpe_catalog_products p on p.id = cp.product_id and p.business_id = cp.business_id
    where cp.campaign_id = v_source.id and cp.business_id = p_business_id
  ) then
    raise exception 'Campaign has no available products to duplicate' using errcode = '23514';
  end if;

  insert into public.ejnexa_catalog_campaigns (
    business_id, name, description, campaign_kind, promotion_type, percentage_discount,
    fixed_discount, promo_price, badge_text, image_path, starts_on, ends_on,
    active, featured, sort_order, archived_at
  ) values (
    p_business_id, 'Copia de ' || left(v_source.name, 111), v_source.description,
    v_source.campaign_kind, v_source.promotion_type, v_source.percentage_discount,
    v_source.fixed_discount, v_source.promo_price, v_source.badge_text, v_source.image_path,
    v_source.starts_on, v_source.ends_on, false, v_source.featured, v_source.sort_order, null
  ) returning * into v_copy;

  insert into public.ejnexa_catalog_campaign_products (campaign_id, business_id, product_id, position)
  select v_copy.id, p_business_id, cp.product_id, cp.position
  from public.ejnexa_catalog_campaign_products cp
  join public.arpe_catalog_products p on p.id = cp.product_id and p.business_id = cp.business_id
  where cp.campaign_id = v_source.id and cp.business_id = p_business_id
  order by cp.position;

  return next v_copy;
  return;
end;
$$;

create function private.ejnexa_archive_catalog_campaign(p_business_id uuid, p_campaign_id uuid)
returns setof public.ejnexa_catalog_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_campaign public.ejnexa_catalog_campaigns;
begin
  if auth.uid() is null then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  select b.owner_id into v_owner_id from public.arpe_businesses b where b.id = p_business_id;
  if v_owner_id is distinct from auth.uid() then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  select c.* into v_campaign from public.ejnexa_catalog_campaigns c
  where c.id = p_campaign_id and c.business_id = p_business_id for update;
  if not found then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  update public.ejnexa_catalog_campaigns c set active = false, archived_at = now()
  where c.id = p_campaign_id and c.business_id = p_business_id returning * into v_campaign;
  return next v_campaign;
  return;
end;
$$;

create function private.ejnexa_restore_catalog_campaign(p_business_id uuid, p_campaign_id uuid)
returns setof public.ejnexa_catalog_campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_campaign public.ejnexa_catalog_campaigns;
begin
  if auth.uid() is null then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  select b.owner_id into v_owner_id from public.arpe_businesses b where b.id = p_business_id;
  if v_owner_id is distinct from auth.uid() then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  select c.* into v_campaign from public.ejnexa_catalog_campaigns c
  where c.id = p_campaign_id and c.business_id = p_business_id for update;
  if not found then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  if v_campaign.archived_at is null then raise exception 'Campaign is not archived' using errcode = '23514'; end if;
  update public.ejnexa_catalog_campaigns c set archived_at = null, active = false
  where c.id = p_campaign_id and c.business_id = p_business_id returning * into v_campaign;
  return next v_campaign;
  return;
end;
$$;

create function private.ejnexa_delete_catalog_campaign(p_business_id uuid, p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_campaign public.ejnexa_catalog_campaigns;
begin
  if auth.uid() is null then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  select b.owner_id into v_owner_id from public.arpe_businesses b where b.id = p_business_id;
  if v_owner_id is distinct from auth.uid() then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  select c.* into v_campaign from public.ejnexa_catalog_campaigns c
  where c.id = p_campaign_id and c.business_id = p_business_id for update;
  if not found then raise exception 'Not authorized to manage this campaign' using errcode = '42501'; end if;
  if v_campaign.archived_at is null then raise exception 'Archive the campaign before deleting it' using errcode = '23514'; end if;
  if exists (
    select 1 from public.arpe_catalog_request_items i
    where i.business_id = p_business_id and i.campaign_id_snapshot = p_campaign_id
  ) then
    raise exception 'EJNEXA_CAMPAIGN_HAS_HISTORY' using errcode = '23503';
  end if;
  delete from public.ejnexa_catalog_campaigns c where c.id = p_campaign_id and c.business_id = p_business_id;
  return true;
end;
$$;

create function public.ejnexa_duplicate_catalog_campaign(p_business_id uuid, p_campaign_id uuid)
returns setof public.ejnexa_catalog_campaigns
language sql security definer set search_path = ''
as $$ select * from private.ejnexa_duplicate_catalog_campaign(p_business_id, p_campaign_id); $$;

create function public.ejnexa_archive_catalog_campaign(p_business_id uuid, p_campaign_id uuid)
returns setof public.ejnexa_catalog_campaigns
language sql security definer set search_path = ''
as $$ select * from private.ejnexa_archive_catalog_campaign(p_business_id, p_campaign_id); $$;

create function public.ejnexa_restore_catalog_campaign(p_business_id uuid, p_campaign_id uuid)
returns setof public.ejnexa_catalog_campaigns
language sql security definer set search_path = ''
as $$ select * from private.ejnexa_restore_catalog_campaign(p_business_id, p_campaign_id); $$;

create function public.ejnexa_delete_catalog_campaign(p_business_id uuid, p_campaign_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$ select private.ejnexa_delete_catalog_campaign(p_business_id, p_campaign_id); $$;

revoke all on function private.ejnexa_duplicate_catalog_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function private.ejnexa_archive_catalog_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function private.ejnexa_restore_catalog_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function private.ejnexa_delete_catalog_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ejnexa_duplicate_catalog_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ejnexa_archive_catalog_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ejnexa_restore_catalog_campaign(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ejnexa_delete_catalog_campaign(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ejnexa_duplicate_catalog_campaign(uuid, uuid) to authenticated;
grant execute on function public.ejnexa_archive_catalog_campaign(uuid, uuid) to authenticated;
grant execute on function public.ejnexa_restore_catalog_campaign(uuid, uuid) to authenticated;
grant execute on function public.ejnexa_delete_catalog_campaign(uuid, uuid) to authenticated;

comment on column public.ejnexa_catalog_campaigns.archived_at is
  'When set, the campaign is archived, inactive, hidden publicly and excluded from promotion rules.';
comment on function public.ejnexa_delete_catalog_campaign(uuid, uuid) is
  'Deletes only an archived campaign with no arpe_catalog_request_items campaign snapshot history.';

notify pgrst, 'reload schema';
commit;
