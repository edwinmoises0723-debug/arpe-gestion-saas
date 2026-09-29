create table public.arpe_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  quote_id uuid not null unique,
  order_number text not null,
  source_quote_number text not null,
  customer_name text not null,
  customer_phone text not null default '',
  product text not null,
  portions integer,
  flavor text not null default '',
  filling text not null default '',
  decoration text not null default '',
  extras text not null default '',
  delivery_date date,
  delivery_time time,
  notes text not null default '',
  total_amount numeric(12,2) not null check (total_amount >= 0),
  deposit_type text not null check (deposit_type in ('percentage', 'fixed')),
  deposit_value numeric(12,2) not null check (deposit_value >= 0),
  deposit_required numeric(12,2) not null check (deposit_required >= 0 and deposit_required <= total_amount),
  internal_cost_total numeric(12,2) check (internal_cost_total is null or internal_cost_total >= 0),
  estimated_profit numeric(12,2),
  real_margin_percent numeric(12,4),
  status text not null default 'confirmed' check (status in ('confirmed', 'in_preparation', 'ready', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, order_number),
  unique (quote_id, business_id),
  constraint arpe_orders_source_quote_business_fk
    foreign key (quote_id, business_id) references public.arpe_quotes(id, business_id) on delete restrict
);

create index arpe_orders_business_created_idx on public.arpe_orders (business_id, created_at desc);
create index arpe_orders_business_status_idx on public.arpe_orders (business_id, status);
create index arpe_orders_business_delivery_idx on public.arpe_orders (business_id, delivery_date, delivery_time);

create table private.arpe_order_sequences (
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  sequence_year integer not null,
  next_number integer not null default 1 check (next_number > 0),
  primary key (business_id, sequence_year)
);
alter table private.arpe_order_sequences enable row level security;
revoke all on private.arpe_order_sequences from public, anon, authenticated;

alter table public.arpe_orders enable row level security;
revoke all on public.arpe_orders from public, anon, authenticated;
grant select on public.arpe_orders to authenticated;
create policy arpe_orders_owner_select on public.arpe_orders for select to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

create function private.convert_arpe_quote_to_order(p_quote_id uuid)
returns setof public.arpe_orders
language plpgsql security definer set search_path = public, private as $$
declare
  v_user_id uuid := (select auth.uid());
  v_quote public.arpe_quotes;
  v_order public.arpe_orders;
  v_internal_cost numeric(12,2);
  v_profit numeric(12,2);
  v_margin numeric(12,4);
  v_year integer := extract(year from now())::integer;
  v_number integer;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;

  select q.* into v_quote
    from public.arpe_quotes q
    join public.arpe_businesses b on b.id = q.business_id
   where q.id = p_quote_id and b.owner_id = v_user_id
   for update of q;
  if not found then raise exception 'Quote not found or access denied'; end if;

  select o.* into v_order from public.arpe_orders o
   where o.quote_id = v_quote.id and o.business_id = v_quote.business_id;
  if found then return next v_order; return; end if;
  if v_quote.status <> 'accepted' then raise exception 'Only accepted quotes can become orders'; end if;

  select c.total_internal_cost into v_internal_cost
    from public.arpe_quote_costs c
   where c.quote_id = v_quote.id and c.business_id = v_quote.business_id;
  if found then
    v_profit := round(v_quote.total_amount - v_internal_cost, 2);
    if v_quote.total_amount > 0 then v_margin := round(v_profit / v_quote.total_amount * 100, 4); end if;
  end if;

  insert into private.arpe_order_sequences (business_id, sequence_year, next_number)
  values (v_quote.business_id, v_year, 2)
  on conflict (business_id, sequence_year) do update
    set next_number = private.arpe_order_sequences.next_number + 1
  returning next_number - 1 into v_number;

  insert into public.arpe_orders (
    business_id, quote_id, order_number, source_quote_number,
    customer_name, customer_phone, product, portions, flavor, filling, decoration, extras,
    delivery_date, delivery_time, notes, total_amount, deposit_type, deposit_value,
    deposit_required, internal_cost_total, estimated_profit, real_margin_percent, status
  ) values (
    v_quote.business_id, v_quote.id, format('ARPE-PED-%s-%s', v_year, lpad(v_number::text, 4, '0')), v_quote.quote_number,
    v_quote.customer_name, v_quote.customer_phone, v_quote.product, v_quote.portions, v_quote.flavor, v_quote.filling,
    v_quote.decoration, v_quote.extras, v_quote.delivery_date, v_quote.delivery_time, v_quote.notes,
    v_quote.total_amount, v_quote.deposit_type, v_quote.deposit_value, v_quote.deposit_required,
    v_internal_cost, v_profit, v_margin, 'confirmed'
  ) returning * into v_order;
  return next v_order;
end;
$$;
revoke all on function private.convert_arpe_quote_to_order(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.convert_arpe_quote_to_order(uuid) to authenticated;

create function private.update_arpe_order_status(p_order_id uuid, p_status text)
returns setof public.arpe_orders
language plpgsql security definer set search_path = public, private as $$
declare
  v_user_id uuid := (select auth.uid());
  v_order public.arpe_orders;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_status not in ('confirmed', 'in_preparation', 'ready', 'delivered', 'cancelled') then
    raise exception 'Invalid order status';
  end if;
  update public.arpe_orders o set status = p_status, updated_at = now()
   where o.id = p_order_id
     and exists (select 1 from public.arpe_businesses b where b.id = o.business_id and b.owner_id = v_user_id)
  returning * into v_order;
  if not found then raise exception 'Order not found or access denied'; end if;
  return next v_order;
end;
$$;
revoke all on function private.update_arpe_order_status(uuid, text) from public, anon;
grant execute on function private.update_arpe_order_status(uuid, text) to authenticated;

create function public.arpe_convert_quote_to_order(p_quote_id uuid)
returns setof public.arpe_orders
language sql security invoker set search_path = '' as $$
  select * from private.convert_arpe_quote_to_order(p_quote_id);
$$;
revoke all on function public.arpe_convert_quote_to_order(uuid) from public, anon;
grant execute on function public.arpe_convert_quote_to_order(uuid) to authenticated;

create function public.arpe_update_order_status(p_order_id uuid, p_status text)
returns setof public.arpe_orders
language sql security invoker set search_path = '' as $$
  select * from private.update_arpe_order_status(p_order_id, p_status);
$$;
revoke all on function public.arpe_update_order_status(uuid, text) from public, anon;
grant execute on function public.arpe_update_order_status(uuid, text) to authenticated;
