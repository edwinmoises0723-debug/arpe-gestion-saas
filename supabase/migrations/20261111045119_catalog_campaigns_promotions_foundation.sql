begin;

create table public.ejnexa_catalog_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  campaign_kind text not null check (campaign_kind in ('promotion', 'showcase')),
  promotion_type text check (promotion_type in ('percentage', 'fixed_discount', 'fixed_price', 'two_for_one', 'combo')),
  percentage_discount numeric(5,2),
  fixed_discount numeric(12,2),
  promo_price numeric(12,2),
  badge_text text check (badge_text is null or char_length(btrim(badge_text)) between 1 and 60),
  image_path text,
  starts_on date,
  ends_on date,
  active boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ejnexa_catalog_campaigns_id_business_unique unique (id, business_id),
  constraint ejnexa_catalog_campaigns_dates_check check (starts_on is null or ends_on is null or ends_on >= starts_on),
  constraint ejnexa_catalog_campaigns_type_values_check check (
    (campaign_kind = 'showcase'
      and promotion_type is null
      and percentage_discount is null
      and fixed_discount is null
      and promo_price is null)
    or (campaign_kind = 'promotion' and (
      (promotion_type = 'percentage'
        and percentage_discount > 0 and percentage_discount <= 100
        and fixed_discount is null and promo_price is null)
      or (promotion_type = 'fixed_discount'
        and fixed_discount > 0
        and percentage_discount is null and promo_price is null)
      or (promotion_type = 'fixed_price'
        and promo_price >= 0
        and percentage_discount is null and fixed_discount is null)
      or (promotion_type in ('two_for_one', 'combo')
        and percentage_discount is null and fixed_discount is null and promo_price is null)
    ))
  )
);

create table public.ejnexa_catalog_campaign_products (
  campaign_id uuid not null,
  business_id uuid not null,
  product_id uuid not null,
  position integer not null default 1 check (position >= 1),
  created_at timestamptz not null default now(),
  primary key (campaign_id, product_id),
  constraint ejnexa_catalog_campaign_products_position_unique unique (campaign_id, position),
  constraint ejnexa_catalog_campaign_products_campaign_business_fk
    foreign key (campaign_id, business_id)
    references public.ejnexa_catalog_campaigns (id, business_id) on delete cascade,
  constraint ejnexa_catalog_campaign_products_product_business_fk
    foreign key (product_id, business_id)
    references public.arpe_catalog_products (id, business_id) on delete cascade
);

create index ejnexa_catalog_campaigns_business_active_dates_idx
  on public.ejnexa_catalog_campaigns (business_id, active, starts_on, ends_on);
create index ejnexa_catalog_campaign_products_product_business_idx
  on public.ejnexa_catalog_campaign_products (product_id, business_id, campaign_id);

alter table public.ejnexa_catalog_campaigns enable row level security;
alter table public.ejnexa_catalog_campaign_products enable row level security;
revoke all on table public.ejnexa_catalog_campaigns, public.ejnexa_catalog_campaign_products
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.ejnexa_catalog_campaigns, public.ejnexa_catalog_campaign_products to authenticated;

create policy ejnexa_catalog_campaigns_owner_all
  on public.ejnexa_catalog_campaigns for all to authenticated
  using (exists (
    select 1 from public.arpe_businesses b
    where b.id = ejnexa_catalog_campaigns.business_id
      and b.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.arpe_businesses b
    where b.id = ejnexa_catalog_campaigns.business_id
      and b.owner_id = (select auth.uid())
  ));

create policy ejnexa_catalog_campaign_products_owner_all
  on public.ejnexa_catalog_campaign_products for all to authenticated
  using (exists (
    select 1 from public.arpe_businesses b
    where b.id = ejnexa_catalog_campaign_products.business_id
      and b.owner_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.arpe_businesses b
    where b.id = ejnexa_catalog_campaign_products.business_id
      and b.owner_id = (select auth.uid())
  ));

create trigger ejnexa_catalog_campaigns_updated_at
  before update on public.ejnexa_catalog_campaigns
  for each row execute function public.arpe_set_updated_at();

-- Serialize writes for the same product before checking overlapping active promotions.
-- Editorial showcases may overlap; only commercial promotion campaigns are exclusive.
create function private.ejnexa_assert_catalog_campaign_no_stacking()
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

    if not found or v_campaign.active is not true or v_campaign.campaign_kind <> 'promotion' then
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
        and c.campaign_kind = 'promotion'
        and coalesce(c.starts_on, '-infinity'::date) <= coalesce(v_campaign.ends_on, 'infinity'::date)
        and coalesce(v_campaign.starts_on, '-infinity'::date) <= coalesce(c.ends_on, 'infinity'::date)
    ) then
      raise exception 'A product cannot have overlapping active commercial promotions' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'ejnexa_catalog_campaigns' then
    if new.active is not true or new.campaign_kind <> 'promotion' then
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
revoke all on function private.ejnexa_assert_catalog_campaign_no_stacking() from public, anon, authenticated;

create trigger ejnexa_catalog_campaign_products_no_stacking
  before insert or update on public.ejnexa_catalog_campaign_products
  for each row execute function private.ejnexa_assert_catalog_campaign_no_stacking();
create trigger ejnexa_catalog_campaigns_no_stacking
  before insert or update on public.ejnexa_catalog_campaigns
  for each row execute function private.ejnexa_assert_catalog_campaign_no_stacking();

-- Campaign images use the existing public marketing-media bucket and owner/business folder.
create or replace function private.arpe_guard_catalog_media_path()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_parts text[];
begin
  if tg_table_schema <> 'public' then
    raise exception 'Catalog media paths are only valid on public catalog tables' using errcode = '23514';
  end if;

  if tg_table_name = 'arpe_catalog_products' then
    if new.image_path is null then return new; end if;
    select b.owner_id into v_owner_id from public.arpe_businesses b where b.id = new.business_id;
    v_parts := string_to_array(new.image_path, '/');
    if v_owner_id is null or cardinality(v_parts) <> 4 or v_parts[1] <> v_owner_id::text
      or v_parts[2] <> new.business_id::text or v_parts[3] <> 'products'
      or btrim(v_parts[4]) = '' or v_parts[4] in ('.', '..') then
      raise exception 'Catalog product image path must belong to its business' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'ejnexa_catalog_campaigns' then
    if new.image_path is null then return new; end if;
    select b.owner_id into v_owner_id from public.arpe_businesses b where b.id = new.business_id;
    v_parts := string_to_array(new.image_path, '/');
    if v_owner_id is null or cardinality(v_parts) <> 4 or v_parts[1] <> v_owner_id::text
      or v_parts[2] <> new.business_id::text or v_parts[3] <> 'campaigns'
      or btrim(v_parts[4]) = '' or v_parts[4] in ('.', '..') then
      raise exception 'Catalog campaign image path must belong to its business' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_table_name = 'arpe_businesses' then
    if new.public_catalog_logo_path is null then return new; end if;
    v_parts := string_to_array(new.public_catalog_logo_path, '/');
    if cardinality(v_parts) <> 4 or v_parts[1] <> new.owner_id::text
      or v_parts[2] <> new.id::text or v_parts[3] <> 'profile'
      or btrim(v_parts[4]) = '' or v_parts[4] in ('.', '..') then
      raise exception 'Public catalog logo path must belong to its business' using errcode = '23514';
    end if;
    return new;
  end if;

  raise exception 'Catalog media path guard attached to an unsupported table' using errcode = '23514';
end;
$$;
revoke all on function private.arpe_guard_catalog_media_path() from public, anon, authenticated;

create trigger arpe_catalog_campaign_media_path_guard
  before insert or update on public.ejnexa_catalog_campaigns
  for each row execute function private.arpe_guard_catalog_media_path();

drop policy "Catalog owners can upload marketing media" on storage.objects;
drop policy "Catalog owners can select marketing media" on storage.objects;
drop policy "Catalog owners can delete marketing media" on storage.objects;

create policy "Catalog owners can upload marketing media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ejnexa-catalog-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.arpe_businesses b where b.id::text = (storage.foldername(objects.name))[2] and b.owner_id = (select auth.uid()))
    and (storage.foldername(name))[3] in ('products', 'profile', 'campaigns')
    and cardinality(storage.foldername(name)) = 3
    and storage.filename(name) <> ''
  );
create policy "Catalog owners can select marketing media"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ejnexa-catalog-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.arpe_businesses b where b.id::text = (storage.foldername(objects.name))[2] and b.owner_id = (select auth.uid()))
    and (storage.foldername(name))[3] in ('products', 'profile', 'campaigns')
    and cardinality(storage.foldername(name)) = 3
    and storage.filename(name) <> ''
  );
create policy "Catalog owners can delete marketing media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'ejnexa-catalog-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (select 1 from public.arpe_businesses b where b.id::text = (storage.foldername(objects.name))[2] and b.owner_id = (select auth.uid()))
    and (storage.foldername(name))[3] in ('products', 'profile', 'campaigns')
    and cardinality(storage.foldername(name)) = 3
    and storage.filename(name) <> ''
  );

comment on table public.ejnexa_catalog_campaigns is 'Promotion and editorial showcase campaigns for public catalogs. Validity is inclusive calendar dates; hour/timezone scheduling is deferred.';
comment on table public.ejnexa_catalog_campaign_products is 'Tenant-safe product associations for public catalog campaigns.';

alter table public.arpe_catalog_request_items
  add column campaign_id_snapshot uuid,
  add column campaign_name_snapshot text,
  add column campaign_kind_snapshot text check (campaign_kind_snapshot is null or campaign_kind_snapshot in ('promotion', 'showcase')),
  add column promotion_type_snapshot text check (promotion_type_snapshot is null or promotion_type_snapshot in ('percentage', 'fixed_discount', 'fixed_price', 'two_for_one', 'combo')),
  add column promotion_badge_snapshot text,
  add column base_unit_price_snapshot numeric(12,2) check (base_unit_price_snapshot is null or (base_unit_price_snapshot >= 0 and base_unit_price_snapshot < 10000000000)),
  add column promotional_unit_price_snapshot numeric(12,2) check (promotional_unit_price_snapshot is null or (promotional_unit_price_snapshot >= 0 and promotional_unit_price_snapshot < 10000000000)),
  add constraint arpe_catalog_request_items_campaign_snapshot_check check (
    (campaign_id_snapshot is null and campaign_name_snapshot is null and campaign_kind_snapshot is null and promotion_type_snapshot is null and promotion_badge_snapshot is null)
    or (campaign_id_snapshot is not null and campaign_name_snapshot is not null and campaign_kind_snapshot is not null)
  ),
  add constraint arpe_catalog_request_items_campaign_type_snapshot_check check (
    (campaign_kind_snapshot is null and promotion_type_snapshot is null)
    or (campaign_kind_snapshot = 'showcase' and promotion_type_snapshot is null)
    or (campaign_kind_snapshot = 'promotion' and promotion_type_snapshot is not null)
  ),
  add constraint arpe_catalog_request_items_promotional_price_snapshot_check check (
    promotional_unit_price_snapshot is null
    or (promotion_type_snapshot in ('percentage', 'fixed_discount', 'fixed_price') and base_unit_price_snapshot is not null)
  );

comment on column public.arpe_catalog_request_items.public_unit_price_snapshot is 'Unit price presented by the server at request submission, including an applicable monetary promotion.';
comment on column public.arpe_catalog_request_items.base_unit_price_snapshot is 'Pre-promotion public price captured at request submission; NULL for contact-priced products.';
comment on column public.arpe_catalog_request_items.promotional_unit_price_snapshot is 'Server-resolved monetary promotion unit price; NULL for non-monetary promotions such as 2x1.';

drop function public.ejnexa_get_public_catalog_products(text);
create function public.ejnexa_get_public_catalog_products(p_slug text)
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
  select p.id, p.name, p.category, p.description, p.unit_label,
    case
      when p.public_price_mode = 'contact' then null
      when c.promotion_type = 'percentage' then greatest(0::numeric, round(p.default_unit_price * (100 - c.percentage_discount) / 100, 2))
      when c.promotion_type = 'fixed_discount' then greatest(0::numeric, round(p.default_unit_price - c.fixed_discount, 2))
      when c.promotion_type = 'fixed_price' then c.promo_price
      else p.default_unit_price
    end,
    p.default_portions, p.image_path, p.public_price_mode, p.public_sort_order,
    c.id, c.campaign_kind, c.promotion_type,
    coalesce(c.badge_text, case c.promotion_type
      when 'percentage' then trim(trailing '.' from trim(trailing '0' from c.percentage_discount::text)) || '% OFF'
      when 'fixed_discount' then 'Oferta'
      when 'fixed_price' then 'Precio especial'
      when 'two_for_one' then '2x1'
      when 'combo' then 'Combo'
      else null
    end),
    c.name, c.description, c.image_path, c.featured,
    case when p.public_price_mode = 'contact' then null else p.default_unit_price end,
    case
      when p.public_price_mode = 'contact' then null
      when c.promotion_type = 'percentage' then greatest(0::numeric, round(p.default_unit_price * (100 - c.percentage_discount) / 100, 2))
      when c.promotion_type = 'fixed_discount' then greatest(0::numeric, round(p.default_unit_price - c.fixed_discount, 2))
      when c.promotion_type = 'fixed_price' then c.promo_price
      else null
    end
  from public.arpe_catalog_products p
  join public.arpe_businesses b on b.id = p.business_id
  left join lateral (
    select campaign.*
    from public.ejnexa_catalog_campaign_products cp
    join public.ejnexa_catalog_campaigns campaign on campaign.id = cp.campaign_id and campaign.business_id = cp.business_id
    where cp.product_id = p.id and cp.business_id = p.business_id
      and campaign.active = true
      and (campaign.starts_on is null or campaign.starts_on <= current_date)
      and (campaign.ends_on is null or campaign.ends_on >= current_date)
      and not (p.public_price_mode = 'contact' and campaign.campaign_kind = 'promotion'
        and campaign.promotion_type in ('percentage', 'fixed_discount', 'fixed_price'))
    order by case when campaign.campaign_kind = 'promotion' then 0 else 1 end,
      campaign.featured desc, campaign.sort_order, campaign.created_at desc
    limit 1
  ) c on true
  where b.catalog_slug = p_slug
    and b.public_catalog_enabled = true
    and p.is_active = true
    and p.is_public = true
  order by p.public_sort_order asc, p.name asc;
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
  v_product record;
  v_promotional_unit_price numeric(12,2);
  v_public_unit_price numeric(12,2);
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

    select p.name, p.category, p.unit_label, p.default_portions, p.public_price_mode, p.default_unit_price,
      c.id as campaign_id, c.name as campaign_name, c.campaign_kind, c.promotion_type, c.promotion_badge
    into v_product
    from public.arpe_catalog_products p
    left join lateral (
      select campaign.id, campaign.name, campaign.campaign_kind, campaign.promotion_type,
        coalesce(campaign.badge_text, case campaign.promotion_type
          when 'percentage' then trim(trailing '.' from trim(trailing '0' from campaign.percentage_discount::text)) || '% OFF'
          when 'fixed_discount' then 'Oferta'
          when 'fixed_price' then 'Precio especial'
          when 'two_for_one' then '2x1'
          when 'combo' then 'Combo'
          else null
        end) as promotion_badge
      from public.ejnexa_catalog_campaign_products cp
      join public.ejnexa_catalog_campaigns campaign on campaign.id = cp.campaign_id and campaign.business_id = cp.business_id
      where cp.product_id = p.id and cp.business_id = p.business_id
        and campaign.active = true
        and (campaign.starts_on is null or campaign.starts_on <= current_date)
        and (campaign.ends_on is null or campaign.ends_on >= current_date)
        and not (p.public_price_mode = 'contact' and campaign.campaign_kind = 'promotion'
          and campaign.promotion_type in ('percentage', 'fixed_discount', 'fixed_price'))
      order by case when campaign.campaign_kind = 'promotion' then 0 else 1 end,
        campaign.featured desc, campaign.sort_order, campaign.created_at desc
      limit 1
    ) c on true
    where p.id = v_product_id and p.business_id = v_business_id and p.is_active = true and p.is_public = true;

    if not found then raise exception 'Invalid catalog product'; end if;

    v_promotional_unit_price := null;
    v_public_unit_price := case when v_product.public_price_mode = 'contact' then null else v_product.default_unit_price end;
    if v_product.public_price_mode <> 'contact' then
      if v_product.promotion_type = 'percentage' then
        v_promotional_unit_price := greatest(0::numeric, round(v_product.default_unit_price * (100 - (select c.percentage_discount from public.ejnexa_catalog_campaigns c where c.id = v_product.campaign_id)) / 100, 2));
      elsif v_product.promotion_type = 'fixed_discount' then
        v_promotional_unit_price := greatest(0::numeric, round(v_product.default_unit_price - (select c.fixed_discount from public.ejnexa_catalog_campaigns c where c.id = v_product.campaign_id), 2));
      elsif v_product.promotion_type = 'fixed_price' then
        select c.promo_price into v_promotional_unit_price from public.ejnexa_catalog_campaigns c where c.id = v_product.campaign_id;
      end if;
      if v_promotional_unit_price is not null then v_public_unit_price := v_promotional_unit_price; end if;
    end if;

    insert into public.arpe_catalog_request_items (
      request_id, business_id, catalog_product_id, position, product_name_snapshot, category_snapshot,
      quantity, unit_label_snapshot, default_portions_snapshot, public_price_mode_snapshot,
      public_unit_price_snapshot, campaign_id_snapshot, campaign_name_snapshot, campaign_kind_snapshot,
      promotion_type_snapshot, promotion_badge_snapshot, base_unit_price_snapshot, promotional_unit_price_snapshot
    ) values (
      v_request.id, v_business_id, v_product_id, v_position, v_product.name, v_product.category,
      v_quantity, v_product.unit_label, v_product.default_portions, v_product.public_price_mode,
      v_public_unit_price, v_product.campaign_id, v_product.campaign_name, v_product.campaign_kind,
      v_product.promotion_type, v_product.promotion_badge,
      case when v_product.public_price_mode = 'contact' then null else v_product.default_unit_price end,
      v_promotional_unit_price
    );
  end loop;

  return query select v_request.id, v_request.request_number, v_request.status, v_request.submitted_at;
end;
$$;
revoke all on function public.ejnexa_submit_catalog_request(text, uuid, text, text, date, text, jsonb) from public, anon, authenticated;
grant execute on function public.ejnexa_submit_catalog_request(text, uuid, text, text, date, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
