create table if not exists public.arpe_cost_settings (
  business_id uuid primary key references public.arpe_businesses(id) on delete cascade,
  waste_percent numeric(6,2) not null default 12 check (waste_percent >= 0 and waste_percent <= 100),
  indirect_percent numeric(6,2) not null default 12 check (indirect_percent >= 0),
  labor_hourly_rate numeric(12,2) not null default 0 check (labor_hourly_rate >= 0),
  markup_percent numeric(8,2) not null default 60 check (markup_percent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.arpe_quote_costs (
  quote_id uuid primary key references public.arpe_quotes(id) on delete cascade,
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  ingredients_cost numeric(12,2) not null default 0 check (ingredients_cost >= 0),
  waste_percent numeric(6,2) not null default 12 check (waste_percent >= 0 and waste_percent <= 100),
  waste_amount numeric(12,2) not null default 0 check (waste_amount >= 0),
  labor_hours numeric(10,2) not null default 0 check (labor_hours >= 0),
  labor_hourly_rate numeric(12,2) not null default 0 check (labor_hourly_rate >= 0),
  labor_cost numeric(12,2) not null default 0 check (labor_cost >= 0),
  indirect_percent numeric(6,2) not null default 12 check (indirect_percent >= 0),
  indirect_amount numeric(12,2) not null default 0 check (indirect_amount >= 0),
  delivery_internal_cost numeric(12,2) not null default 0 check (delivery_internal_cost >= 0),
  delivery_customer_charge numeric(12,2) not null default 0 check (delivery_customer_charge >= 0),
  markup_percent numeric(8,2) not null default 60 check (markup_percent >= 0),
  production_subtotal numeric(12,2) not null default 0 check (production_subtotal >= 0),
  production_cost numeric(12,2) not null default 0 check (production_cost >= 0),
  total_internal_cost numeric(12,2) not null default 0 check (total_internal_cost >= 0),
  suggested_product_price numeric(12,2) not null default 0 check (suggested_product_price >= 0),
  suggested_customer_total numeric(12,2) not null default 0 check (suggested_customer_total >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, business_id)
);

create table if not exists public.arpe_quote_cost_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.arpe_quotes(id) on delete cascade,
  business_id uuid not null references public.arpe_businesses(id) on delete cascade,
  category text not null check (category in ('packaging', 'topper', 'decoration', 'supplies', 'other')),
  name text not null check (char_length(trim(name)) between 1 and 160),
  cost numeric(12,2) not null check (cost >= 0),
  created_at timestamptz not null default now()
);

create index if not exists arpe_quote_costs_business_idx on public.arpe_quote_costs(business_id);
create index if not exists arpe_quote_cost_items_quote_idx on public.arpe_quote_cost_items(quote_id);
create index if not exists arpe_quote_cost_items_business_idx on public.arpe_quote_cost_items(business_id);

create or replace function public.arpe_cost_settings_updated_at()
returns trigger language plpgsql security invoker set search_path = public, private as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.arpe_quote_costs_updated_at()
returns trigger language plpgsql security invoker set search_path = public, private as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.create_arpe_cost_settings()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  insert into public.arpe_cost_settings (business_id) values (new.id) on conflict (business_id) do nothing;
  return new;
end;
$$;

create or replace function private.calculate_arpe_quote_costs()
returns trigger language plpgsql security invoker set search_path = public, private as $$
declare
  direct_total numeric := 0;
begin
  select coalesce(sum(cost), 0) into direct_total
    from public.arpe_quote_cost_items
   where quote_id = new.quote_id and business_id = new.business_id;
  new.waste_amount := round(new.ingredients_cost * new.waste_percent / 100, 2);
  new.labor_cost := round(new.labor_hours * new.labor_hourly_rate, 2);
  new.production_subtotal := round(new.ingredients_cost + new.waste_amount + direct_total + new.labor_cost, 2);
  new.indirect_amount := round(new.production_subtotal * new.indirect_percent / 100, 2);
  new.production_cost := round(new.production_subtotal + new.indirect_amount, 2);
  new.total_internal_cost := round(new.production_cost + new.delivery_internal_cost, 2);
  new.suggested_product_price := round(new.production_cost * (1 + new.markup_percent / 100), 2);
  new.suggested_customer_total := round(new.suggested_product_price + new.delivery_customer_charge, 2);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists arpe_cost_settings_updated_at on public.arpe_cost_settings;
create trigger arpe_cost_settings_updated_at before update on public.arpe_cost_settings
for each row execute function public.arpe_cost_settings_updated_at();
drop trigger if exists arpe_quote_costs_updated_at on public.arpe_quote_costs;
create trigger arpe_quote_costs_updated_at before update on public.arpe_quote_costs
for each row execute function public.arpe_quote_costs_updated_at();
drop trigger if exists arpe_business_create_cost_settings on public.arpe_businesses;
create trigger arpe_business_create_cost_settings after insert on public.arpe_businesses
for each row execute function private.create_arpe_cost_settings();
drop trigger if exists arpe_calculate_quote_costs on public.arpe_quote_costs;
create trigger arpe_calculate_quote_costs before insert or update on public.arpe_quote_costs
for each row execute function private.calculate_arpe_quote_costs();

insert into public.arpe_cost_settings (business_id)
select id from public.arpe_businesses
on conflict (business_id) do nothing;

alter table public.arpe_cost_settings enable row level security;
alter table public.arpe_quote_costs enable row level security;
alter table public.arpe_quote_cost_items enable row level security;

grant select, insert, update on public.arpe_cost_settings to authenticated;
grant select, insert, update, delete on public.arpe_quote_costs to authenticated;
grant select, insert, update, delete on public.arpe_quote_cost_items to authenticated;

drop policy if exists "cost settings owner select" on public.arpe_cost_settings;
create policy "cost settings owner select" on public.arpe_cost_settings for select to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "cost settings owner insert" on public.arpe_cost_settings;
create policy "cost settings owner insert" on public.arpe_cost_settings for insert to authenticated
with check (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "cost settings owner update" on public.arpe_cost_settings;
create policy "cost settings owner update" on public.arpe_cost_settings for update to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

drop policy if exists "quote costs owner select" on public.arpe_quote_costs;
create policy "quote costs owner select" on public.arpe_quote_costs for select to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "quote costs owner insert" on public.arpe_quote_costs;
create policy "quote costs owner insert" on public.arpe_quote_costs for insert to authenticated
with check (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "quote costs owner update" on public.arpe_quote_costs;
create policy "quote costs owner update" on public.arpe_quote_costs for update to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "quote costs owner delete" on public.arpe_quote_costs;
create policy "quote costs owner delete" on public.arpe_quote_costs for delete to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

drop policy if exists "quote cost items owner select" on public.arpe_quote_cost_items;
create policy "quote cost items owner select" on public.arpe_quote_cost_items for select to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "quote cost items owner insert" on public.arpe_quote_cost_items;
create policy "quote cost items owner insert" on public.arpe_quote_cost_items for insert to authenticated
with check (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "quote cost items owner update" on public.arpe_quote_cost_items;
create policy "quote cost items owner update" on public.arpe_quote_cost_items for update to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())))
with check (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));
drop policy if exists "quote cost items owner delete" on public.arpe_quote_cost_items;
create policy "quote cost items owner delete" on public.arpe_quote_cost_items for delete to authenticated
using (exists (select 1 from public.arpe_businesses b where b.id = business_id and b.owner_id = (select auth.uid())));

revoke all on function public.arpe_cost_settings_updated_at() from public, anon, authenticated;
revoke all on function public.arpe_quote_costs_updated_at() from public, anon, authenticated;
revoke all on function private.create_arpe_cost_settings() from public, anon, authenticated;
revoke all on function private.calculate_arpe_quote_costs() from public, anon, authenticated;
