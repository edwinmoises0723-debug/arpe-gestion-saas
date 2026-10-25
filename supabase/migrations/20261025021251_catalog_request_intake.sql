begin;

create table private.arpe_catalog_request_sequences (
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  sequence_year integer not null check (sequence_year between 1 and 9999),
  next_number integer not null check (next_number >= 2),
  primary key (business_id, sequence_year)
);

alter table private.arpe_catalog_request_sequences enable row level security;
revoke all on table private.arpe_catalog_request_sequences from public, anon, authenticated;

create table public.arpe_catalog_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  request_number text not null,
  client_request_key uuid not null,
  customer_name text not null check (char_length(btrim(customer_name)) between 2 and 100),
  customer_phone text not null default '' check (char_length(customer_phone) <= 30),
  desired_date date,
  details text not null default '' check (char_length(details) <= 1000),
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'converted', 'declined', 'archived')),
  converted_quote_id uuid,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  converted_at timestamptz,
  constraint arpe_catalog_requests_id_business_unique unique (id, business_id),
  constraint arpe_catalog_requests_key_unique unique (business_id, client_request_key),
  constraint arpe_catalog_requests_number_unique unique (business_id, request_number),
  constraint arpe_catalog_requests_quote_business_fk
    foreign key (converted_quote_id, business_id)
    references public.arpe_quotes (id, business_id) on delete restrict
);

create index arpe_catalog_requests_business_submitted_idx
  on public.arpe_catalog_requests (business_id, submitted_at desc);
create index arpe_catalog_requests_business_status_submitted_idx
  on public.arpe_catalog_requests (business_id, status, submitted_at desc);

create table public.arpe_catalog_request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  business_id uuid not null,
  catalog_product_id uuid not null,
  position integer not null check (position >= 1),
  product_name_snapshot text not null,
  category_snapshot text not null,
  quantity integer not null check (quantity between 1 and 9999),
  unit_label_snapshot text not null check (char_length(btrim(unit_label_snapshot)) between 1 and 40),
  default_portions_snapshot integer check (default_portions_snapshot is null or default_portions_snapshot > 0),
  public_price_mode_snapshot text not null
    check (public_price_mode_snapshot in ('exact', 'from', 'contact')),
  public_unit_price_snapshot numeric(12,2),
  created_at timestamptz not null default now(),
  constraint arpe_catalog_request_items_position_unique unique (request_id, position),
  constraint arpe_catalog_request_items_product_unique unique (request_id, catalog_product_id),
  constraint arpe_catalog_request_items_price_snapshot_check check (
    (public_price_mode_snapshot = 'contact' and public_unit_price_snapshot is null)
    or (
      public_price_mode_snapshot in ('exact', 'from')
      and public_unit_price_snapshot is not null
      and public_unit_price_snapshot >= 0
      and public_unit_price_snapshot < 10000000000
    )
  ),
  constraint arpe_catalog_request_items_request_business_fk
    foreign key (request_id, business_id)
    references public.arpe_catalog_requests (id, business_id) on delete cascade,
  constraint arpe_catalog_request_items_product_business_fk
    foreign key (catalog_product_id, business_id)
    references public.arpe_catalog_products (id, business_id)
);

-- The unique (request_id, position) index also supports request_id lookups and cascades.
create index arpe_catalog_request_items_product_business_idx
  on public.arpe_catalog_request_items (catalog_product_id, business_id);

alter table public.arpe_catalog_requests enable row level security;
alter table public.arpe_catalog_request_items enable row level security;
revoke all on table public.arpe_catalog_requests, public.arpe_catalog_request_items
  from public, anon, authenticated;
grant select on table public.arpe_catalog_requests, public.arpe_catalog_request_items
  to authenticated;

create policy arpe_catalog_requests_owner_select
  on public.arpe_catalog_requests for select to authenticated
  using (
    exists (
      select 1
      from public.arpe_businesses b
      where b.id = arpe_catalog_requests.business_id
        and b.owner_id = (select auth.uid())
    )
  );

create policy arpe_catalog_request_items_owner_select
  on public.arpe_catalog_request_items for select to authenticated
  using (
    exists (
      select 1
      from public.arpe_businesses b
      where b.id = arpe_catalog_request_items.business_id
        and b.owner_id = (select auth.uid())
    )
  );

create trigger arpe_catalog_requests_updated_at
  before update on public.arpe_catalog_requests
  for each row execute function public.arpe_set_updated_at();

create function public.ejnexa_submit_catalog_request(
  p_slug text,
  p_client_request_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_desired_date date,
  p_details text,
  p_items jsonb
)
returns table (
  id uuid,
  request_number text,
  status text,
  submitted_at timestamptz
)
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
begin
  select b.id
    into v_business_id
  from public.arpe_businesses b
  where b.catalog_slug = p_slug
    and b.public_catalog_enabled = true;

  if not found then
    raise exception 'Catalog not available';
  end if;

  if p_client_request_key is null then
    raise exception 'Invalid request key';
  end if;

  -- A replay returns the original result before validating the replayed payload.
  select r.*
    into v_request
  from public.arpe_catalog_requests r
  where r.business_id = v_business_id
    and r.client_request_key = p_client_request_key;

  if found then
    return query select v_request.id, v_request.request_number, v_request.status, v_request.submitted_at;
    return;
  end if;

  if p_customer_name is null or char_length(btrim(p_customer_name)) not between 2 and 100 then
    raise exception 'Customer name must contain 2 to 100 characters';
  end if;

  if char_length(coalesce(p_customer_phone, '')) > 30 then
    raise exception 'Customer phone must contain at most 30 characters';
  end if;

  if p_desired_date is not null and p_desired_date < current_date then
    raise exception 'Desired date cannot be in the past';
  end if;

  if char_length(coalesce(p_details, '')) > 1000 then
    raise exception 'Request details must contain at most 1000 characters';
  end if;

  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Request items must be an array';
  end if;

  if jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'Request must contain between 1 and 50 products';
  end if;

  insert into private.arpe_catalog_request_sequences (business_id, sequence_year, next_number)
  values (v_business_id, v_sequence_year, 2)
  on conflict (business_id, sequence_year) do update
    set next_number = private.arpe_catalog_request_sequences.next_number + 1
  returning next_number - 1 into v_sequence_number;

  insert into public.arpe_catalog_requests (
    business_id,
    request_number,
    client_request_key,
    customer_name,
    customer_phone,
    desired_date,
    details
  ) values (
    v_business_id,
    'SOL-' || v_sequence_year::text || '-' || lpad(v_sequence_number::text, 4, '0'),
    p_client_request_key,
    btrim(p_customer_name),
    coalesce(p_customer_phone, ''),
    p_desired_date,
    coalesce(p_details, '')
  )
  on conflict (business_id, client_request_key) do nothing
  returning * into v_request;

  if not found then
    -- A concurrent request with this key won the unique constraint race.
    select r.*
      into v_request
    from public.arpe_catalog_requests r
    where r.business_id = v_business_id
      and r.client_request_key = p_client_request_key;

    return query select v_request.id, v_request.request_number, v_request.status, v_request.submitted_at;
    return;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) as items(value)
  loop
    v_position := v_position + 1;

    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'Each request item must be an object';
    end if;

    if jsonb_typeof(v_item -> 'product_id') is distinct from 'string' then
      raise exception 'Invalid catalog product';
    end if;
    v_product_id_text := v_item ->> 'product_id';
    begin
      v_product_id := v_product_id_text::uuid;
    exception when invalid_text_representation then
      raise exception 'Invalid catalog product';
    end;

    if v_product_id = any(v_product_ids) then
      raise exception 'Duplicate catalog product';
    end if;
    v_product_ids := array_append(v_product_ids, v_product_id);

    if jsonb_typeof(v_item -> 'quantity') is distinct from 'number' then
      raise exception 'Quantity must be an integer between 1 and 9999';
    end if;
    v_quantity_text := v_item ->> 'quantity';
    if v_quantity_text is null or v_quantity_text !~ '^[1-9][0-9]{0,3}$' then
      raise exception 'Quantity must be an integer between 1 and 9999';
    end if;
    v_quantity := v_quantity_text::integer;

    select
      p.name,
      p.category,
      p.unit_label,
      p.default_portions,
      p.public_price_mode,
      case when p.public_price_mode = 'contact' then null else p.default_unit_price end as public_unit_price
      into v_product
    from public.arpe_catalog_products p
    where p.id = v_product_id
      and p.business_id = v_business_id
      and p.is_active = true
      and p.is_public = true;

    if not found then
      raise exception 'Invalid catalog product';
    end if;

    insert into public.arpe_catalog_request_items (
      request_id,
      business_id,
      catalog_product_id,
      position,
      product_name_snapshot,
      category_snapshot,
      quantity,
      unit_label_snapshot,
      default_portions_snapshot,
      public_price_mode_snapshot,
      public_unit_price_snapshot
    ) values (
      v_request.id,
      v_business_id,
      v_product_id,
      v_position,
      v_product.name,
      v_product.category,
      v_quantity,
      v_product.unit_label,
      v_product.default_portions,
      v_product.public_price_mode,
      v_product.public_unit_price
    );
  end loop;

  return query select v_request.id, v_request.request_number, v_request.status, v_request.submitted_at;
end;
$$;

revoke all on function public.ejnexa_submit_catalog_request(text, uuid, text, text, date, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.ejnexa_submit_catalog_request(text, uuid, text, text, date, text, jsonb)
  to anon, authenticated;

commit;
