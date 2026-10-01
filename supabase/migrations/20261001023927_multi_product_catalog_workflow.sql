-- REVIEW BEFORE APPLYING. This migration is transactional; never run fragments.
begin;
lock table public.arpe_quotes, public.arpe_orders, public.arpe_quote_costs,
  public.arpe_quote_cost_items, public.arpe_payments in access exclusive mode;

-- Preserve full historical rows, including timestamps and payment history.
create temporary table arpe_before_quotes on commit drop as select * from public.arpe_quotes;
create temporary table arpe_before_orders on commit drop as select * from public.arpe_orders;
create temporary table arpe_before_payments on commit drop as select * from public.arpe_payments;
do $$ begin
  if exists (select 1 from public.arpe_quote_costs c join public.arpe_quotes q on q.id=c.quote_id
    where c.delivery_customer_charge > q.total_amount or c.delivery_internal_cost > c.total_internal_cost
      or c.production_cost <> c.total_internal_cost-c.delivery_internal_cost) then
    raise exception 'Legacy quote cost/delivery cannot be separated exactly; migration aborted';
  end if;
end $$;

create table public.arpe_catalog_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.arpe_businesses(id),
  name text not null check (length(btrim(name)) between 1 and 160),
  category text not null default 'Otros', description text not null default '',
  unit_label text not null default 'unidad' check (length(btrim(unit_label)) between 1 and 40),
  default_unit_price numeric(12,2) not null default 0 check (default_unit_price >= 0 and default_unit_price < 10000000000),
  default_portions integer check (default_portions > 0),
  default_flavor text not null default '', default_filling text not null default '',
  default_decoration text not null default '', default_extras text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,business_id)
);
create index arpe_catalog_business_idx on public.arpe_catalog_products(business_id,is_active,category);
create trigger arpe_catalog_updated before update on public.arpe_catalog_products
for each row execute function public.arpe_quotes_updated_at();

alter table public.arpe_quotes
  add column delivery_internal_cost numeric(12,2) not null default 0 check (delivery_internal_cost >= 0 and delivery_internal_cost < 10000000000),
  add column delivery_customer_charge numeric(12,2) not null default 0 check (delivery_customer_charge >= 0 and delivery_customer_charge < 10000000000);
-- NULL explicitly means unknown legacy breakdown, never a known zero.
alter table public.arpe_orders
  add column delivery_internal_cost numeric(12,2) check (delivery_internal_cost >= 0 and delivery_internal_cost < 10000000000),
  add column delivery_customer_charge numeric(12,2) check (delivery_customer_charge >= 0 and delivery_customer_charge < 10000000000),
  add constraint arpe_orders_id_business_unique unique(id,business_id);

create table public.arpe_quote_items (
  id uuid primary key default gen_random_uuid(), business_id uuid not null,
  quote_id uuid not null, catalog_product_id uuid,
  position integer not null check (position >= 1),
  product text not null check (length(btrim(product)) between 1 and 160),
  quantity numeric(12,3) not null default 1 check (quantity > 0 and quantity < 1000000000),
  unit_label text not null default 'unidad' check (length(btrim(unit_label)) between 1 and 40),
  portions integer check (portions > 0), flavor text not null default '', filling text not null default '',
  decoration text not null default '', extras text not null default '', notes text not null default '',
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0 and unit_price < 10000000000),
  line_total numeric(12,2) generated always as (round(quantity*unit_price,2)) stored,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(quote_id,position), unique(id,business_id),
  foreign key(quote_id,business_id) references public.arpe_quotes(id,business_id) on delete cascade,
  foreign key(catalog_product_id,business_id) references public.arpe_catalog_products(id,business_id)
);
create index arpe_quote_items_business_idx on public.arpe_quote_items(business_id,quote_id);
create index arpe_quote_items_catalog_idx on public.arpe_quote_items(catalog_product_id,business_id);

create table public.arpe_quote_item_costs (
  quote_item_id uuid primary key, business_id uuid not null,
  ingredients_cost numeric(12,2) not null check(ingredients_cost >= 0 and ingredients_cost < 10000000000),
  waste_percent numeric(6,2) not null check(waste_percent between 0 and 100),
  waste_amount numeric(12,2) not null,
  labor_hours numeric(10,2) not null check(labor_hours >= 0 and labor_hours < 100000000),
  labor_hourly_rate numeric(12,2) not null check(labor_hourly_rate >= 0 and labor_hourly_rate < 10000000000),
  labor_cost numeric(12,2) not null,
  indirect_percent numeric(6,2) not null check(indirect_percent >= 0 and indirect_percent < 10000),
  indirect_amount numeric(12,2) not null,
  markup_percent numeric(8,2) not null check(markup_percent >= 0 and markup_percent < 1000000),
  production_subtotal numeric(12,2) not null, production_cost numeric(12,2) not null,
  total_internal_cost numeric(12,2) not null check(total_internal_cost >= 0 and total_internal_cost < 10000000000),
  suggested_line_price numeric(12,2) not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(quote_item_id,business_id) references public.arpe_quote_items(id,business_id) on delete cascade
);
create index arpe_item_costs_business_idx on public.arpe_quote_item_costs(business_id);
create table public.arpe_quote_item_cost_items (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, quote_item_id uuid not null,
  category text not null check(category in ('packaging','topper','decoration','supplies','other')),
  name text not null check(length(btrim(name)) between 1 and 160),
  cost numeric(12,2) not null check(cost >= 0 and cost < 10000000000),
  created_at timestamptz not null default now(),
  foreign key(quote_item_id,business_id) references public.arpe_quote_items(id,business_id) on delete cascade
);
create index arpe_item_direct_business_idx on public.arpe_quote_item_cost_items(business_id,quote_item_id);
create index arpe_item_direct_item_idx on public.arpe_quote_item_cost_items(quote_item_id);

create table public.arpe_order_items (
  id uuid primary key default gen_random_uuid(), business_id uuid not null, order_id uuid not null,
  source_quote_item_id uuid, position integer not null check(position >= 1),
  product text not null check(length(btrim(product)) between 1 and 160),
  quantity numeric(12,3) not null check(quantity > 0 and quantity < 1000000000),
  unit_label text not null default 'unidad', portions integer, flavor text not null default '',
  filling text not null default '', decoration text not null default '', extras text not null default '', notes text not null default '',
  unit_price numeric(12,2) not null check(unit_price >= 0 and unit_price < 10000000000),
  line_total numeric(12,2) generated always as(round(quantity*unit_price,2)) stored,
  internal_cost_total numeric(12,2), estimated_profit numeric(12,2), real_margin_percent numeric(12,4),
  created_at timestamptz not null default now(), unique(order_id,position),
  foreign key(order_id,business_id) references public.arpe_orders(id,business_id) on delete cascade,
  foreign key(source_quote_item_id,business_id) references public.arpe_quote_items(id,business_id)
);
create index arpe_order_items_business_idx on public.arpe_order_items(business_id,order_id);
create index arpe_order_items_source_idx on public.arpe_order_items(source_quote_item_id,business_id);

-- Owner policies also apply to reads through the API. All item writes use the atomic RPC.
do $$ declare t text; begin
  foreach t in array array['arpe_catalog_products','arpe_quote_items','arpe_quote_item_costs','arpe_quote_item_cost_items','arpe_order_items'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy owner_select on public.%I for select to authenticated using (exists(select 1 from public.arpe_businesses b where b.id=business_id and b.owner_id=(select auth.uid())))',t);
  end loop;
end $$;
grant insert,update on public.arpe_catalog_products to authenticated;
create policy owner_insert on public.arpe_catalog_products for insert to authenticated
with check(exists(select 1 from public.arpe_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));
create policy owner_update on public.arpe_catalog_products for update to authenticated
using(exists(select 1 from public.arpe_businesses b where b.id=business_id and b.owner_id=(select auth.uid())))
with check(exists(select 1 from public.arpe_businesses b where b.id=business_id and b.owner_id=(select auth.uid())));

-- Backfill quotes using their CURRENT cost; do NOT use this cost to reconstruct old orders.
alter table public.arpe_quotes disable trigger arpe_quote_updated;
alter table public.arpe_quotes disable trigger arpe_quote_deposit_guard;
update public.arpe_quotes q set delivery_internal_cost=c.delivery_internal_cost, delivery_customer_charge=c.delivery_customer_charge
from public.arpe_quote_costs c where c.quote_id=q.id;
alter table public.arpe_quotes enable trigger arpe_quote_updated;
alter table public.arpe_quotes enable trigger arpe_quote_deposit_guard;
insert into public.arpe_quote_items(business_id,quote_id,position,product,quantity,unit_label,portions,flavor,filling,decoration,extras,unit_price)
select business_id,id,1,product,1,'unidad',portions,flavor,filling,decoration,extras,total_amount-delivery_customer_charge from public.arpe_quotes;
insert into public.arpe_quote_item_costs(quote_item_id,business_id,ingredients_cost,waste_percent,waste_amount,labor_hours,labor_hourly_rate,labor_cost,indirect_percent,indirect_amount,markup_percent,production_subtotal,production_cost,total_internal_cost,suggested_line_price,created_at,updated_at)
select i.id,c.business_id,c.ingredients_cost,c.waste_percent,c.waste_amount,c.labor_hours,c.labor_hourly_rate,c.labor_cost,c.indirect_percent,c.indirect_amount,c.markup_percent,c.production_subtotal,c.production_cost,c.total_internal_cost-c.delivery_internal_cost,c.suggested_product_price,c.created_at,c.updated_at
from public.arpe_quote_costs c join public.arpe_quote_items i on i.quote_id=c.quote_id;
insert into public.arpe_quote_item_cost_items(business_id,quote_item_id,category,name,cost,created_at)
select c.business_id,i.id,c.category,c.name,c.cost,c.created_at from public.arpe_quote_cost_items c join public.arpe_quote_items i on i.quote_id=c.quote_id;
insert into public.arpe_order_items(business_id,order_id,source_quote_item_id,position,product,quantity,unit_label,portions,flavor,filling,decoration,extras,unit_price)
select o.business_id,o.id,i.id,1,o.product,1,'unidad',o.portions,o.flavor,o.filling,o.decoration,o.extras,o.total_amount
from public.arpe_orders o left join public.arpe_quote_items i on i.quote_id=o.quote_id;

-- Server calculates derived cost fields; browser cannot supply them.
create function private.calculate_arpe_item_cost() returns trigger language plpgsql set search_path='' as $$
declare d numeric; begin
  select coalesce(sum(cost),0) into d from public.arpe_quote_item_cost_items where quote_item_id=new.quote_item_id;
  new.waste_amount:=round(new.ingredients_cost*new.waste_percent/100,2);
  new.labor_cost:=round(new.labor_hours*new.labor_hourly_rate,2);
  new.production_subtotal:=new.ingredients_cost+new.waste_amount+d+new.labor_cost;
  new.indirect_amount:=round(new.production_subtotal*new.indirect_percent/100,2);
  new.production_cost:=new.production_subtotal+new.indirect_amount;
  new.total_internal_cost:=new.production_cost;
  new.suggested_line_price:=round(new.production_cost*(1+new.markup_percent/100),2);
  new.updated_at:=now(); return new;
end $$;
revoke all on function private.calculate_arpe_item_cost() from public,anon,authenticated;
create trigger calculate_item_cost before insert or update on public.arpe_quote_item_costs
for each row execute function private.calculate_arpe_item_cost();

create function private.save_arpe_quote_bundle(p_quote_id uuid,p_header jsonb,p_items jsonb)
returns setof public.arpe_quotes language plpgsql security definer set search_path='' as $$
declare b uuid; q public.arpe_quotes; i jsonb; c jsonb; item_id uuid; pos integer:=0; subtotal numeric:=0; first_item jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select id into b from public.arpe_businesses where owner_id=auth.uid();
  if b is null then raise exception 'Business not found'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Items must be an array'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'La cotización necesita entre 1 y 100 productos.'; end if;
  if p_quote_id is not null then
    select * into q from public.arpe_quotes where id=p_quote_id and business_id=b for update;
    if not found then raise exception 'Quote not found or access denied'; end if;
    if exists(select 1 from public.arpe_orders where quote_id=q.id) then raise exception 'Esta cotización ya generó un pedido.'; end if;
  end if;
  for i in select value from jsonb_array_elements(p_items) loop
    if not ((i->>'quantity')::numeric > 0 and (i->>'quantity')::numeric < 1000000000)
      or not ((i->>'unit_price')::numeric >= 0 and (i->>'unit_price')::numeric < 10000000000)
      or i->>'quantity' is null or i->>'unit_price' is null then raise exception 'Invalid quantity or unit price'; end if;
    -- Same precision as persisted columns; never accept a browser line_total.
    subtotal:=subtotal+round(round((i->>'quantity')::numeric,3)*round((i->>'unit_price')::numeric,2),2);
  end loop;
  first_item:=p_items->0;
  if p_quote_id is null then
    insert into public.arpe_quotes(business_id,customer_name,product,total_amount)
    values(b,p_header->>'customer_name',first_item->>'product',subtotal+coalesce((p_header->>'delivery_customer_charge')::numeric,0)) returning * into q;
  end if;
  update public.arpe_quotes set customer_name=p_header->>'customer_name',customer_phone=coalesce(p_header->>'customer_phone',''),
    product=first_item->>'product',portions=(first_item->>'portions')::integer,flavor=coalesce(first_item->>'flavor',''),
    filling=coalesce(first_item->>'filling',''),decoration=coalesce(first_item->>'decoration',''),extras=coalesce(first_item->>'extras',''),
    delivery_date=nullif(p_header->>'delivery_date','')::date,delivery_time=nullif(p_header->>'delivery_time','')::time,
    notes=coalesce(p_header->>'notes',''),status=p_header->>'status',deposit_type=p_header->>'deposit_type',deposit_value=(p_header->>'deposit_value')::numeric,
    delivery_internal_cost=coalesce((p_header->>'delivery_internal_cost')::numeric,0),
    delivery_customer_charge=coalesce((p_header->>'delivery_customer_charge')::numeric,0),
    total_amount=subtotal+round(coalesce((p_header->>'delivery_customer_charge')::numeric,0),2)
    where id=q.id returning * into q;
  -- Replace the unconverted bundle atomically. Server assigns fresh IDs to every snapshot.
  delete from public.arpe_quote_items where quote_id=q.id;
  for i in select value from jsonb_array_elements(p_items) loop
    pos:=pos+1;
    insert into public.arpe_quote_items(business_id,quote_id,catalog_product_id,position,product,quantity,unit_label,portions,flavor,filling,decoration,extras,notes,unit_price)
    values(b,q.id,(i->>'catalog_product_id')::uuid,pos,i->>'product',(i->>'quantity')::numeric,i->>'unit_label',(i->>'portions')::integer,
      coalesce(i->>'flavor',''),coalesce(i->>'filling',''),coalesce(i->>'decoration',''),coalesce(i->>'extras',''),coalesce(i->>'notes',''),(i->>'unit_price')::numeric)
    returning id into item_id;
    c:=i->'cost';
    if c is not null and c <> 'null'::jsonb then
      insert into public.arpe_quote_item_cost_items(business_id,quote_item_id,category,name,cost)
      select b,item_id,x->>'category',x->>'name',(x->>'cost')::numeric from jsonb_array_elements(coalesce(i->'direct_costs','[]'::jsonb)) x;
      insert into public.arpe_quote_item_costs(quote_item_id,business_id,ingredients_cost,waste_percent,labor_hours,labor_hourly_rate,indirect_percent,markup_percent)
      values(item_id,b,(c->>'ingredients_cost')::numeric,(c->>'waste_percent')::numeric,(c->>'labor_hours')::numeric,(c->>'labor_hourly_rate')::numeric,(c->>'indirect_percent')::numeric,(c->>'markup_percent')::numeric);
    elsif jsonb_array_length(coalesce(i->'direct_costs','[]'::jsonb)) > 0 then raise exception 'Direct costs require item costing'; end if;
  end loop;
  return next q;
end $$;
revoke all on function private.save_arpe_quote_bundle(uuid,jsonb,jsonb) from public,anon;
grant execute on function private.save_arpe_quote_bundle(uuid,jsonb,jsonb) to authenticated;
create function public.arpe_save_quote_bundle(p_quote_id uuid,p_header jsonb,p_items jsonb)
returns setof public.arpe_quotes language sql security invoker set search_path='' as $$
  select * from private.save_arpe_quote_bundle(p_quote_id,p_header,p_items);
$$;
revoke all on function public.arpe_save_quote_bundle(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.arpe_save_quote_bundle(uuid,jsonb,jsonb) to authenticated;

-- Lock converted quote headers too; prior UI restrictions now have server enforcement.
create function private.guard_converted_quote() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select 1 from public.arpe_orders where quote_id=old.id) then raise exception 'Esta cotización ya generó un pedido.'; end if;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
revoke all on function private.guard_converted_quote() from public,anon,authenticated;
create trigger guard_converted_quote before update or delete on public.arpe_quotes for each row execute function private.guard_converted_quote();
-- Only the bundle may change financial/commercial fields. Status and deletion retain existing flows.
revoke insert,update on public.arpe_quotes from authenticated;
grant update(status) on public.arpe_quotes to authenticated;
revoke insert,update,delete on public.arpe_quote_costs,public.arpe_quote_cost_items from authenticated;

-- Final invariants compare every old field, not just totals. NULL order delivery is deliberate.
do $$ begin
  if exists(select 1 from arpe_before_quotes a full join public.arpe_quotes b using(id)
    where to_jsonb(a) is distinct from (to_jsonb(b)-'delivery_internal_cost'-'delivery_customer_charge'))
    or exists(select 1 from arpe_before_orders a full join public.arpe_orders b using(id)
    where to_jsonb(a) is distinct from (to_jsonb(b)-'delivery_internal_cost'-'delivery_customer_charge'))
    or exists(select 1 from arpe_before_payments a full join public.arpe_payments b using(id) where to_jsonb(a) is distinct from to_jsonb(b)) then
    raise exception 'Historical row changed; migration aborted';
  end if;
  if exists(select 1 from public.arpe_quotes q where not exists(select 1 from public.arpe_quote_items i where i.quote_id=q.id)
    or q.total_amount<>(select sum(line_total) from public.arpe_quote_items i where i.quote_id=q.id)+q.delivery_customer_charge)
    or exists(select 1 from public.arpe_orders o where not exists(select 1 from public.arpe_order_items i where i.order_id=o.id)
    or o.total_amount<>(select sum(line_total) from public.arpe_order_items i where i.order_id=o.id)+coalesce(o.delivery_customer_charge,0)) then
    raise exception 'Historical item total mismatch; migration aborted';
  end if;
  if exists(select 1 from public.arpe_quote_costs c join public.arpe_quote_items i on i.quote_id=c.quote_id
    join public.arpe_quote_item_costs n on n.quote_item_id=i.id join public.arpe_quotes q on q.id=c.quote_id
    where c.total_internal_cost<>n.total_internal_cost+q.delivery_internal_cost) then raise exception 'Historical cost mismatch'; end if;
end $$;

create or replace function private.convert_arpe_quote_to_order(p_quote_id uuid)
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

  if not exists(select 1 from public.arpe_quote_items where quote_id=v_quote.id) then raise exception 'Quote has no items'; end if;
  select case when count(c.quote_item_id)=count(*) then sum(c.total_internal_cost)+v_quote.delivery_internal_cost end into v_internal_cost
    from public.arpe_quote_items i left join public.arpe_quote_item_costs c on c.quote_item_id=i.id where i.quote_id=v_quote.id;
  if v_internal_cost is not null then
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
    deposit_required, internal_cost_total, estimated_profit, real_margin_percent, status, delivery_internal_cost, delivery_customer_charge
  ) values (
    v_quote.business_id, v_quote.id, format('ARPE-PED-%s-%s', v_year, lpad(v_number::text, 4, '0')), v_quote.quote_number,
    v_quote.customer_name, v_quote.customer_phone, v_quote.product, v_quote.portions, v_quote.flavor, v_quote.filling,
    v_quote.decoration, v_quote.extras, v_quote.delivery_date, v_quote.delivery_time, v_quote.notes,
    v_quote.total_amount, v_quote.deposit_type, v_quote.deposit_value, v_quote.deposit_required,
    v_internal_cost, v_profit, v_margin, 'confirmed', v_quote.delivery_internal_cost, v_quote.delivery_customer_charge
  ) returning * into v_order;
  insert into public.arpe_order_items(business_id,order_id,source_quote_item_id,position,product,quantity,unit_label,portions,flavor,filling,decoration,extras,notes,unit_price,internal_cost_total,estimated_profit,real_margin_percent)
  select i.business_id,v_order.id,i.id,i.position,i.product,i.quantity,i.unit_label,i.portions,i.flavor,i.filling,i.decoration,i.extras,i.notes,i.unit_price,c.total_internal_cost,
    case when c.quote_item_id is not null then i.line_total-c.total_internal_cost end,
    case when c.quote_item_id is not null and i.line_total>0 then round((i.line_total-c.total_internal_cost)/i.line_total*100,4) end
  from public.arpe_quote_items i left join public.arpe_quote_item_costs c on c.quote_item_id=i.id where i.quote_id=v_quote.id order by i.position;
  return next v_order;
end;
$$;
revoke all on function private.convert_arpe_quote_to_order(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.convert_arpe_quote_to_order(uuid) to authenticated;


commit;
